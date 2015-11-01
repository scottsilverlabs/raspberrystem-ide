package main

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"github.com/kr/pty"
	"html/template"
	"io"
	"io/ioutil"
	"net/http"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
	"sync"
	"encoding/gob"
	"bytes"
	"fmt"
	"regexp"
)

var SETTINGS_FILE = "/etc/rstem_ide.conf"
var COMPANY_DIR = "/opt/raspberrystem/"
var IDE_DIR = COMPANY_DIR + "ide/"
var PROJECTS_DIR = COMPANY_DIR + "projects/"
var PYDOC_DIR = COMPANY_DIR + "pydoc/"
var PYTHON_ORG_DIR = COMPANY_DIR + "python.org/"
var IDE_HTML = IDE_DIR + "ide.html"
var DATA_FILE = IDE_DIR + "storage"

var MAX_OUTPUT_BUF_SIZE = 100000
var MAX_TRUNC_OUTPUT_BUF_SIZE = 1000
var NUM_TRUNC_OUTPUT_LINES = 20
var SLOW_OUTPUT_UPDATE_MSEC = time.Duration(500) * time.Millisecond
var FAST_OUTPUT_UPDATE_MSEC = time.Duration(50) * time.Millisecond

var page, _ = template.New("index").ParseFiles(IDE_HTML)
var hostname, _ = ioutil.ReadFile("/etc/hostname")
var users = make(map[string]string)  //Used to track users and their current file
var config = make(map[string]string) //Used for settings
var changeSockets = make(map[string][]*websocket.Conn)
var lastSocket *websocket.Conn
var savedConfig = make(map[string]string)

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

	if _, err := os.Stat(DATA_FILE); os.IsNotExist(err) {
		println("Creating initial storage file")
		savedConfig["lastfile"] = ""
		savedConfig["loadfile"] = ""
		savedConfig["bootfiles"] = ""
		savedConfig["overridelastfile"] = ""
		saveMap();
	}
	loadMap();

	config["ip"] = ""
	config["lastfile"] = savedConfig["lastfile"]
	config["bootfiles"] = savedConfig["bootfiles"]
	config["overridelastfile"] = savedConfig["overridelastfile"]
	
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil {
					config["ip"] += iface.Name + ": " + ipnet.IP.String() + "\n"
				}
			}
		}
	}

	os.Mkdir(config["projectdir"], 0775)

	if savedConfig["bootfiles"] != "" {
		for _, v := range strings.Split(savedConfig["bootfiles"], ",") {
			content, _ := ioutil.ReadFile(config["projectdir"] + v)
			if string(content[:2]) == "#!" {
				go exec.Command(config["projectdir"] + v).Run();
			} else {
				go exec.Command("/usr/bin/python3", config["projectdir"] + v).Run();				
			}
		}
	}

	http.HandleFunc("/", index) //All requests to / and 404s will route to Index
	http.HandleFunc("/api/listfiles", listFiles)
	http.HandleFunc("/api/listthemes", listThemes)
	http.HandleFunc("/api/readfile", readFile)
	http.HandleFunc("/api/savefile", saveFile)
	http.HandleFunc("/api/copyfile", copyFile)
	http.HandleFunc("/api/deletefile", deleteFile)
	http.HandleFunc("/api/hostname", hostnameOut)
	http.HandleFunc("/api/poweroff", poweroff)
	http.HandleFunc("/api/reboot", reboot)
	http.HandleFunc("/api/setbootfiles", setBootFiles)
	http.HandleFunc("/api/setoverridelastfile", setOverrideLastFile)
	http.HandleFunc("/api/configuration", configuration)
	http.HandleFunc("/api/softwareversions", softwareVersions)
	http.Handle("/api/upgrade", websocket.Handler(upgradeServer))
	http.Handle("/api/socket", websocket.Handler(socketServer))
	http.Handle("/api/change", websocket.Handler(changeServer))
	http.Handle("/projects/", http.StripPrefix("/projects/", http.FileServer(http.Dir(PROJECTS_DIR))))
	http.Handle("/pydoc/", http.StripPrefix("/pydoc/", http.FileServer(http.Dir(PYDOC_DIR))))
	http.Handle("/python.org/", http.StripPrefix("/python.org/", http.FileServer(http.Dir(PYTHON_ORG_DIR))))
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(IDE_DIR+"assets"))))
	err = http.ListenAndServe(":"+config["port"], nil)
	if err != nil {
		panic(err)
	}
}

func saveMap() {
	b := new(bytes.Buffer)
	e := gob.NewEncoder(b)
	err := e.Encode(savedConfig)
	if err != nil {
		panic(err)
	}

	ioutil.WriteFile(DATA_FILE, b.Bytes(), 0644)
}

func loadMap() {
	f, _ := os.Open(DATA_FILE)
	d := gob.NewDecoder(f)
	err := d.Decode(&savedConfig)
	if err != nil {
	     fmt.Println(err)
	     os.Exit(1)
	}

	f.Close()
}

func index(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
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
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
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
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
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
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/plain")
	opts := r.URL.Query()
	fname := strings.Trim(opts.Get("file"), " ./")
	content, err := ioutil.ReadFile(config["projectdir"] + fname)
	if err != nil {
		io.WriteString(w, "error")
		return
	}
	io.WriteString(w, string(content))
	//Set last file
	config["lastfile"] = fname
	savedConfig["lastfile"] = fname
	saveMap()
	println("Read: " + fname)
}

//Potential issue here because POST requests tend to have size limits
func saveFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
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
}

//Basically: cp from to
func copyFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
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

//file = filename to delete
func deleteFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	r.ParseForm()
	fname := strings.Trim(r.Form.Get("file"), " ./")
	os.Remove(config["projectdir"] + fname)
}

//Outputs the hostname, cross-domain allowed for the mobile app to scan for servers
func hostnameOut(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	io.WriteString(w, string(hostname))
}


//Returns the config file as JSON
func configuration(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.Encode(config)
}

func poweroff(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/plain")
	io.WriteString(w, "")
	exec.Command("poweroff").Run();
}

func reboot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/plain")
	io.WriteString(w, "")
	exec.Command("reboot").Run();
}

//Returns the current installed and downloadable software versions, or ConnErr
func softwareVersions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "application/json")
	//Check that pypi.python.org is accessible
	throwaway, err := http.Get("http://pypi.python.org/")
	if err == nil {
		rstem, _ := http.Get("https://pypi.python.org/pypi/raspberrystem/")
		rstemIde, _ := http.Get("http://pypi.python.org/pypi/raspberrystem_ide/")
		rstemProjects, _ := http.Get("http://pypi.python.org/pypi/raspberrystem_projects/")
		defer throwaway.Body.Close()
		defer rstem.Body.Close()
		defer rstemIde.Body.Close()
		defer rstemProjects.Body.Close()
		r := regexp.MustCompile("<title>[^:]+")
		rstemc, _ := ioutil.ReadAll(rstem.Body)
		rstemIdec, _ := ioutil.ReadAll(rstemIde.Body)
		rstemProjectsc, _ := ioutil.ReadAll(rstemProjects.Body)
		tmp := strings.Split(r.FindString(string(rstemc)), " ")
		rstemv := tmp[len(tmp) - 2]
		tmp = strings.Split(r.FindString(string(rstemIdec)), " ")
		rstemIdev := tmp[len(tmp) - 2]
		tmp = strings.Split(r.FindString(string(rstemProjectsc)), " ")
		rstemProjectsv := tmp[len(tmp) - 2]

		out, _ := exec.Command("pip-3.2", "freeze").CombinedOutput()
		r = regexp.MustCompile("raspberrystem.*==\\d+\\.\\d+\\.\\d+")
		rpackages := r.FindAllString(string(out), -1)
		var rstemiv, rstemIdeiv, rstemProjectsiv = "uninstalled", "uninstalled", "uninstalled"
		for _, v := range(rpackages) {
			sp := strings.Split(v, "==")
			if sp[0] == "raspberrystem" {
				rstemiv = sp[1]
			} else if sp[0] == "raspberrystem-ide" {
				rstemIdeiv = sp[1]
			} else if sp[0] == "raspberrystem-projects" {
				rstemProjectsiv = sp[1]
			}
		}
		io.WriteString(w, "{\n\t\"raspberrystem\": [\"" + rstemiv + "\", \"" + rstemv + "\"],\n")
		io.WriteString(w, "\t\"raspberrystem-ide\": [\"" + rstemIdeiv + "\", \"" + rstemIdev + "\"],\n")
		io.WriteString(w, "\t\"raspberrystem-projects\": [\"" + rstemProjectsiv + "\", \"" + rstemProjectsv + "\"]\n}")
	} else {
		io.WriteString(w, "ConnErr")
	}
}

func setBootFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/plain")
	r.ParseForm()
	files := r.Form.Get("files")
	config["bootfiles"] = files
	savedConfig["bootfiles"] = files
	println("Setting boot files to " + files)
	saveMap()
}

func setOverrideLastFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/plain")
	r.ParseForm()
	file := r.Form.Get("file")
	config["overridelastfile"] = file
	savedConfig["overridelastfile"] = file
	println("Setting override lastfile to " + file)
	saveMap()
}

func upgradeServer(s *websocket.Conn) {
	com := exec.Command("pip-3.2", "install", "--upgrade", "raspberrystem", "raspberrystem-projects", "raspberrystem-ide")
	pt, _ := pty.Start(com)
	for {
		out := make([]byte, 1024)
		n, err := pt.Read(out)
		if err != nil {
			s.Write([]byte(err.Error()))
			break
		} else {
			s.Write(out[:n])
		}
		time.Sleep(time.Millisecond * 10) //For minimal CPU impact
	}
	com.Process.Wait()
	s.Write([]byte("Upgrade finished, restarting IDE"))
	out, _ := exec.Command("/etc/init.d/rstem_ided", "restart").CombinedOutput()
	s.Write(out)
	time.Sleep(time.Millisecond * 1000)
	s.Close()
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
	s.Write([]byte("started:"))
	if err != nil {
		s.Write([]byte("error  :" + err.Error()))
		s.Close()
		return
	}
	run := true
	stopped := false
	var buffered_output string
	var last_output time.Time
	var trunc_buf string

	timer := time.NewTimer(0)

	go watchInput(s, com.Process, pt, &run, &stopped)

    // Mutex to protect conncurrent writes from timer
    var mutex = &sync.Mutex{}

	for {
		out := make([]byte, 1024)
		n, err := pt.Read(out)
		mutex.Lock()
		if stopped {
			s.Write([]byte("output :" + buffered_output))
			s.Write([]byte("error  :" + "stopped"))
			break
		} else if err != nil {
			s.Write([]byte("output :" + buffered_output))
			s.Write([]byte("error  :" + err.Error()))
			break
		} else if n > 0 {
			// Buffer new data to buffered_output, but only upto the last
			// MAX_OUTPUT_BUF_SIZE bytes
			buffered_output += string(out[:n])
			if len(buffered_output) > MAX_OUTPUT_BUF_SIZE {
				buffered_output = buffered_output[len(buffered_output)-MAX_OUTPUT_BUF_SIZE:]
			}

			// Write the full untrunctaed buffer at a slow rate, and a truncated
			// version of it (as little as fills the output window) at a faster
			// rate (but not TOO fast).
			if (time.Since(last_output) > SLOW_OUTPUT_UPDATE_MSEC) {
				s.Write([]byte("output :" + buffered_output))
				last_output = time.Now()
			} else if (time.Since(last_output) > FAST_OUTPUT_UPDATE_MSEC) {
				// Truncate to last NUM_TRUNC_OUTPUT_LINES lines
				lines := 0
				var i int
				for i = len(buffered_output) - 1; i > 0; i-- {
					if buffered_output[i] == '\n' {
						lines++
						if lines > NUM_TRUNC_OUTPUT_LINES {
							break
						}
					}
				}

				// Worst case, truncate to MAX_OUTPUT_BUF_SIZE bytes
				if len(buffered_output) - i > MAX_TRUNC_OUTPUT_BUF_SIZE {
					trunc_buf = buffered_output[len(buffered_output)-MAX_TRUNC_OUTPUT_BUF_SIZE:]
				} else {
					trunc_buf = buffered_output[i:]
				}

				s.Write([]byte("output :" + trunc_buf))
				last_output = time.Now()
			}

			// Timer to update buffered output a short time later.  If more
			// output occurs, this timer will continually be put off.
			timer.Reset(SLOW_OUTPUT_UPDATE_MSEC)
			go func() {
				<-timer.C
				mutex.Lock()
				s.Write([]byte("output :" + buffered_output))
				last_output = time.Now()
				mutex.Unlock()
			}()
		}
		mutex.Unlock()
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
