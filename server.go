package main

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"github.com/kr/pty"
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

var hostname, _ = ioutil.ReadFile("/etc/hostname")
var users = make(map[string]string)
var config = map[string]string{
	"port":       "80",
	"projectdir": "~/raspberrystem_projects/",
	"pyshebang":  "#!/usr/bin/env python3",
	"shshebang":  "#!/usr/bin/env bash",
}

func main() {
	settings, err := ioutil.ReadFile("/etc/ide/settings.conf")
	if err == nil {
		set := strings.Split(string(settings), "\n")
		for _, line := range set {
			if len(line) > 0 && line[:1] != "#" {
				if len(line) < 10 || line[2:9] != "Shebang" {
					line = strings.Split(line, "#")[0]
					lsplit := strings.Split(line, " ")
					config[strings.ToLower(lsplit[0])] = strings.TrimRight(
						line[len(lsplit[0])+1:], " ")
				} else {
					begin := strings.Index(line, "\"")
					end := strings.Index(line[begin+1:], "\"")
					config[strings.ToLower(line[0:9])] = line[begin+1 : begin+end+1]
				}
			}
		}
	}
	config["projectdir"] = strings.Replace(config["projectdir"], "~", os.Getenv("HOME"), 1)
	os.Mkdir(config["projectdir"], 0775)
	if err != nil {
		panic(err)
	}
	http.HandleFunc("/", index) //All requests to / and 404s will route to Index
	http.HandleFunc("/ide.js", ideJs)
	http.HandleFunc("/cm.js", cmJs)
	http.HandleFunc("/cm.css", cmCss)
	http.HandleFunc("/python.js", pythonMode)
	http.HandleFunc("/shell.js", shellMode)
	http.HandleFunc("/api/listfiles", listFiles)
	http.HandleFunc("/api/listthemes", listThemes)
	http.HandleFunc("/api/readfile", readFile)
	http.HandleFunc("/api/savefile", saveFile)
	http.HandleFunc("/api/deletefile", deleteFile)
	http.HandleFunc("/api/hostname", hostnameOut)
	http.HandleFunc("/api/configuration", configuration)
	http.Handle("/api/socket", websocket.Handler(socketServer))
	http.Handle("/api/change", websocket.Handler(changeServer))
	http.Handle("/website/", http.StripPrefix("/website/", http.FileServer(http.Dir("/etc/ide/website"))))
	http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir("/etc/ide/assets/images"))))
	http.Handle("/themes/", http.StripPrefix("/themes/", http.FileServer(http.Dir("/etc/ide/assets/themes"))))
	err = http.ListenAndServe(":"+config["port"], nil)
	if err != nil {
		panic(err)
	}
}

func index(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/ide.html")
}

func ideJs(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/ide.js")
}

func cmJs(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/codemirror.js")
}

func cmCss(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/codemirror.css")
}

func pythonMode(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/python.js")
}

func shellMode(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/shell.js")
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
	files, _ := ioutil.ReadDir("/etc/ide/assets/themes/")
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
	ftype := strings.Split(fname, ".")[len(strings.Split(fname, "."))-1]
	content, err := ioutil.ReadFile(config["projectdir"] + fname)
	if err != nil {
		io.WriteString(w, "error")
		return
	}
	contentString := string(content)
	lines := strings.Split(contentString, "\n")
	if len(lines[0]) > 1 && lines[0][0:2] == "#!" {
		if (ftype == "py" && lines[0] == config["pyshebang"]) || (ftype == "sh" &&
			lines[0] == config["shshebang"]) {
			contentString = contentString[len(lines[0])+1:]
		}
	}
	io.WriteString(w, contentString)
}

//Potential issue here because POST requests tend to have size limits
func saveFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	name := strings.Trim(r.Form.Get("file"), " ./")
	content := r.Form.Get("content")
	lines := strings.Split(content, "\n")
	ftype := strings.Split(name, ".")[len(strings.Split(name, "."))-1]
	if len(content) < 2 || lines[0][0:2] != "#!" && config[ftype+"shebang"] != "" {
		content = config[ftype+"shebang"] + "\n" + content
	}
	file, _ := os.OpenFile(config["projectdir"]+name, os.O_CREATE|os.O_WRONLY, 0744)
	file.Truncate(0)
	file.WriteString(content)
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
func watchClose(s *websocket.Conn, p *os.Process) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	payload := string(data[:n]) //[:n] to cut out padding
	if payload == "close" {
		p.Signal(syscall.SIGINT)
	}
}

//Receives socket connections to /api/socket and creates a PTY to run the process
func socketServer(s *websocket.Conn) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	com := exec.Command(config["projectdir"] + string(data[:n])) //[:n] to cut out padding
	pt, err := pty.Start(com)
	if err != nil {
		s.Write([]byte("error: " + err.Error()))
		s.Close()
		return
	}
	go watchClose(s, com.Process)
	for {
		out := make([]byte, 1024)
		n, err := pt.Read(out)
		if err != nil {
			if err.Error() == "read /dev/ptmx: input/output error" || err.Error() == "EOF" {
				break
			}
			s.Write([]byte("error: " + err.Error()))
		} else if n > 0 {
			s.Write([]byte("output: " + string(out[:n])))
		}
		time.Sleep(time.Millisecond * 10) //For minimal CPU impact
	}
	s.Close()
}

var changeSockets = make(map[string][]*websocket.Conn)
var lastSocket *websocket.Conn

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
