package main

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"github.com/kr/pty"
	"html/template"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var SETTINGS_FILE = "/etc/rstem_ide.conf"
var COMPANY_DIR = "/opt/raspberrystem/"
var IDE_DIR = COMPANY_DIR + "ide/"
var PROJECTS_DIR = COMPANY_DIR + "projects/"
var PYDOC_DIR = COMPANY_DIR + "pydoc/"
var IDE_HTML = IDE_DIR + "ide.html"
var LASTFILE_FILE = IDE_DIR + "lastfile"

var page, _ = template.New("index").ParseFiles(IDE_HTML)
var hostname, _ = ioutil.ReadFile("/etc/hostname")
var users = make(map[string]string)  //Used to track users and their current file
var config = make(map[string]string) //Used for settings
var changeSockets = make(map[string][]*websocket.Conn)
var lastSocket *websocket.Conn

func main() {
	settings, err := ioutil.ReadFile(SETTINGS_FILE)
	//Process the settings file
	if err == nil {
		set := strings.Split(string(settings), "\n")
		for _, line := range set {
			if len(line) > 0 && line[:1] != "#" {
				if len(line) < 10 || line[2:9] != "Shebang" {
					line = strings.Split(line, "#")[0]
					lsplit := strings.Split(line, " ")
					config[strings.ToLower(lsplit[0])] = strings.TrimLeft(strings.TrimRight(
						line[len(lsplit[0])+1:], " "), " ")
				} else {
					begin := strings.Index(line, "\"")
					end := strings.Index(line[begin+1:], "\"")
					config[strings.ToLower(line[0:9])] = line[begin+1 : begin+end+1]
				}
			}
		}
	} else {
		panic(err)
	}
	config["projectdir"] = strings.Replace(config["projectdir"], "~", os.Getenv("HOME"), 1)
	last, _ := ioutil.ReadFile(LASTFILE_FILE)
	if string(last) != "" {
		config["lastfile"] = string(last)
	}
	os.Mkdir(config["projectdir"], 0775)
	http.HandleFunc("/", index) //All requests to / and 404s will route to Index
	http.HandleFunc("/api/listfiles", listFiles)
	http.HandleFunc("/api/listthemes", listThemes)
	http.HandleFunc("/api/readfile", readFile)
	http.HandleFunc("/api/savefile", saveFile)
	http.HandleFunc("/api/copyfile", copyFile)
	http.HandleFunc("/api/deletefile", deleteFile)
	http.HandleFunc("/api/hostname", hostnameOut)
	http.HandleFunc("/api/configuration", configuration)
	http.Handle("/api/socket", websocket.Handler(socketServer))
	http.Handle("/api/change", websocket.Handler(changeServer))
	http.Handle("/projects/", http.StripPrefix("/projects/", http.FileServer(http.Dir(PROJECTS_DIR))))
	http.Handle("/pydoc/", http.StripPrefix("/pydoc/", http.FileServer(http.Dir(PYDOC_DIR))))
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(IDE_DIR+"assets"))))
	err = http.ListenAndServe(":"+config["port"], nil)
	if err != nil {
		panic(err)
	}
}

func index(w http.ResponseWriter, r *http.Request) {
	err := page.ExecuteTemplate(w, "ide.html", map[string]string{
		"OutputSize":      config["outputsize"],
		"RaspiTransforms": config["raspitransforms"],
	})
	if err != nil {
		panic(err)
	}
}

//Lists all files in the projects directory
func listFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	files, _ := ioutil.ReadDir(config["projectdir"])
	var list string
	for _, f := range files {
		if !f.IsDir() {
			list += "\n" + f.Name()
		}
	}
	if list != "" {
		io.WriteString(w, list[1:])
	}
}

//Lists the availible themes
func listThemes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	files, _ := ioutil.ReadDir(IDE_DIR + "assets/themes/")
	var list string
	for _, f := range files {
		if !f.IsDir() {
			list += "\n" + f.Name()
		}
	}
	if list != "" {
		io.WriteString(w, list[1:])
	}
}

//Outputs the contents of the requested file
func readFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	opts := r.URL.Query()
	fname := strings.Trim(opts.Get("file"), " ./")
	content, err := ioutil.ReadFile(config["projectdir"] + fname)
	if err != nil {
		io.WriteString(w, "error")
		return
	}
	io.WriteString(w, string(content))
}

//Potential issue here because POST requests tend to have size limits
func saveFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	name := strings.Trim(r.Form.Get("file"), " ./")
	content := r.Form.Get("content")

	//Backup file
	if stat, err := os.Stat(config["projectdir"] + name); err == nil {
		os.Mkdir(config["projectdir"]+"."+name+".bak", os.ModeDir)
		dir, _ := ioutil.ReadDir(config["projectdir"] + "." + name + ".bak")
		size := stat.Size()
		for _, v := range dir {
			size += v.Size()
		}
		i := 0
		//IEC standards be damned, 1MB will always be 2^20 bytes!
		for size > 1048576 && i < len(dir) {
			stat, _ = os.Stat(config["projectdir"] + "." + name + ".bak/" + strconv.Itoa(i+1))
			size -= stat.Size()
			os.Remove(config["projectdir"] + "." + name + ".bak/" + stat.Name())
			i += 1
		}
		//Rename based on number of removes, if 1 got remove then 2 turns to 1, etc.
		for _, v := range dir[i:] {
			intname, _ := strconv.Atoi(v.Name())
			os.Rename(config["projectdir"]+"."+name+".bak/"+v.Name(), config["projectdir"]+"."+name+".bak/"+strconv.Itoa(intname-i))
		}
		os.Rename(config["projectdir"]+name, config["projectdir"]+"."+name+".bak/"+strconv.Itoa(len(dir)-i+1))
	}
	//Write to file
	file, _ := os.OpenFile(config["projectdir"]+name, os.O_CREATE|os.O_WRONLY, 0744)
	file.WriteString(content)
	file.Sync()
	file.Close()
	//Set last file
	config["lastfile"] = name
	file, _ = os.OpenFile(LASTFILE_FILE, os.O_CREATE|os.O_WRONLY, 0744)
	file.Truncate(0)
	file.WriteString(name)
	file.Sync()
	file.Close()
}

func copyFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	from := strings.Trim(r.Form.Get("from"), " ./")
	to := strings.Trim(r.Form.Get("to"), " ./")
	content, _ := ioutil.ReadFile(config["projectdir"] + from)
	file, _ := os.OpenFile(config["projectdir"]+to, os.O_CREATE|os.O_WRONLY, 0744)

	file.Truncate(0)
	file.Write(content)
	file.Sync()
	file.Close()
}

func deleteFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	fname := strings.Trim(r.Form.Get("file"), " ./")
	os.Remove(config["projectdir"] + fname)
}

//Outputs the hostname, cross-domain allowed for the mobile app to scan for servers
func hostnameOut(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	io.WriteString(w, string(hostname))
}

func configuration(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.Encode(config)
}

//Called as a goroutine to wait for the close command and kill the process.
func watchInput(s *websocket.Conn, p *os.Process, pt *os.File, run *bool, stopped *bool) {
	data := make([]byte, 512)
	for {
		n, _ := s.Read(data)
		payload := string(data[:n]) //[:n] to cut out padding
		if ! *run {
			break
		} else if payload == "close" {
			*stopped = true
			p.Signal(syscall.SIGTERM)
			break
		} else if payload != "" {
			pt.Write(data[:n])
		}
		time.Sleep(time.Millisecond * 10) //For minimal CPU impact
	}
}

//Receives socket connections to /api/socket and creates a PTY to run the process
func socketServer(s *websocket.Conn) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	content, _ := ioutil.ReadFile(config["projectdir"] + string(data[:n]))  //[:n] to cut out padding
	var com *exec.Cmd
	if string(content[:2]) == "#!" {
		com = exec.Command(config["projectdir"] + string(data[:n]))
	} else {
		com = exec.Command("/usr/bin/python3", config["projectdir"] + string(data[:n]))
	}
	pt, err := pty.Start(com)
	s.Write([]byte("started"))
	if err != nil {
		s.Write([]byte("error: " + err.Error()))
		s.Close()
		return
	}
	run := true
	stopped := false
	go watchInput(s, com.Process, pt, &run, &stopped)
	for {
		out := make([]byte, 1024)
		n, err := pt.Read(out)
		if stopped {
			s.Write([]byte("error: stopped"))
			break
		} else if err != nil {
			s.Write([]byte("error: " + err.Error()))
			break
		} else if n > 0 {
			s.Write([]byte("output: " + string(out[:n])))
		}
		time.Sleep(time.Millisecond * 10) //For minimal CPU impact
	}
	run = false
	com.Process.Wait()
	s.Close()
}

//Receives /api/change socket connections and manages concurrent editing
func changeServer(s *websocket.Conn) {
	var currFile string
	for {
		var data string
		err := websocket.Message.Receive(s, &data)
		if err != nil {
			break
		}
		//Change of file
		if data[:4] == "COF:" {
			if currFile != "" {
				for i, v := range changeSockets[currFile] {
					if v == s {
						changeSockets[currFile] = append(changeSockets[currFile][:i], changeSockets[currFile][i+1:]...)
						break
					}
				}
				users := strconv.Itoa(len(changeSockets[currFile]))
				for _, v := range changeSockets[currFile] {
					websocket.Message.Send(v, "USERS:"+users)
				}
			}
			currFile = data[4:]
			if len(changeSockets[currFile]) > 0 {
				lastSocket = s
				websocket.Message.Send(changeSockets[currFile][0], "FILE")
			}
			changeSockets[currFile] = append(changeSockets[currFile], s)
			users := strconv.Itoa(len(changeSockets[currFile]))
			for _, v := range changeSockets[currFile] {
				websocket.Message.Send(v, "USERS:"+users)
			}
		} else if data[:4] == "CIF:" { //Change in file
			for _, v := range changeSockets[currFile] {
				if v != s {
					websocket.Message.Send(v, data[4:])
				}
			}
		} else if data[:5] == "FILE:" {
			for _, v := range changeSockets[currFile] {
				if v != s {
					websocket.Message.Send(v, data)
				}
			}
			lastSocket = nil
		}
	}
	if currFile != "" {
		for i, v := range changeSockets[currFile] {
			if v == s {
				changeSockets[currFile] = append(changeSockets[currFile][:i], changeSockets[currFile][i+1:]...)
				break
			}
		}
		users := strconv.Itoa(len(changeSockets[currFile]))
		for _, v := range changeSockets[currFile] {
			websocket.Message.Send(v, "USERS:"+users)
		}
	}
	s.Close()
}
