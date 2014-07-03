package main

import (
	"code.google.com/p/go.net/websocket"
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

var ide *template.Template
var api *template.Template
var hostname, _ = ioutil.ReadFile("/etc/hostname")
var users = make(map[string]string)
var config = map[string]string{"port": "80", "projectdir": "/projects/", "WebviewUrl": "/website/"}

func main() {
	content, err := ioutil.ReadFile("/etc/ide/ide.html") //ide.html is actually a go template
	acontent, aerr := ioutil.ReadFile("/etc/ide/api.html")
	settings, serr := ioutil.ReadFile("/etc/ide/settings.conf")
	if err != nil {
		panic(err)
	}
	if aerr != nil {
		panic(aerr)
	}
	if serr == nil {
		set := strings.Split(string(settings), "\n")
		for _, line := range set {
			if len(line) > 0 && line[0:1] != "#" {
				line = strings.Split(line, "#")[0]
				lsplit := strings.Split(line, " ")
				config[strings.ToLower(lsplit[0])] = strings.TrimRight(line[len(lsplit[0])+1:], " ")
			}
		}
	}
	os.Mkdir(config["projectdir"], 0775)
	ide, err = template.New("page").Parse(string(content))
	api, err = template.New("page").Parse(string(acontent))
	if err != nil {
		panic(err)
	}
	http.HandleFunc("/", index) //All requests to / and 404s will route to Index
	http.HandleFunc("/ide.js", ideJs)
	http.HandleFunc("/cm.js", cmJs)
	http.HandleFunc("/cm.css", cmCss)
	http.HandleFunc("/mode.js", mode)
	http.HandleFunc("/api/", apiDoc)
	http.HandleFunc("/api/listfiles", listFiles)
	http.HandleFunc("/api/listthemes", listThemes)
	http.HandleFunc("/api/usernumber", userNumber)
	http.HandleFunc("/api/userleave", userLeave)
	http.HandleFunc("/api/readfile", readFile)
	http.HandleFunc("/api/savefile", saveFile)
	http.HandleFunc("/api/hostname", hostnameOut)
	http.Handle("/api/socket", websocket.Handler(socketServer))
	http.Handle("/website/", http.StripPrefix("/website/", http.FileServer(http.Dir("/etc/ide/website"))))
	http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir("/etc/ide/assets/images"))))
	http.Handle("/themes/", http.StripPrefix("/themes/", http.FileServer(http.Dir("/etc/ide/assets/themes"))))
	err = http.ListenAndServe(":"+config["port"], nil)
	if err != nil {
		panic(err)
	}
}

//Returns requests to /
func index(w http.ResponseWriter, r *http.Request) {
	data := map[string]string{
		"title":   "RStem IDE@" + string(hostname),
		"baseurl": config["WebviewUrl"],
	}
	ide.ExecuteTemplate(w, "page", data)
}

func apiDoc(w http.ResponseWriter, r *http.Request) {
	api.ExecuteTemplate(w, "page", nil)
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

func mode(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/python.js")
}

func userNumber(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	opts := r.URL.Query()
	fname := strings.Trim(opts.Get("file"), " ./")
	count := 0
	for _, v := range users {
		if v == fname {
			count++
		}
	}
	io.WriteString(w, strconv.Itoa(count))
}

func userLeave(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	users[strings.Split(r.RemoteAddr, ":")[0]] = "exited"
}

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

func readFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	opts := r.URL.Query()
	fname := strings.Trim(opts.Get("file"), " ./")
	contents, err := ioutil.ReadFile(config["projectdir"] + fname)
	if err != nil {
		io.WriteString(w, "error")
		return
	}
	users[strings.Split(r.RemoteAddr, ":")[0]] = fname
	io.WriteString(w, string(contents))
}

//Potential issue here because POST requests tend to have size limits
func saveFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	name := strings.Trim(r.Form.Get("file"), " ./")
	content := r.Form.Get("content")
	ioutil.WriteFile(config["projectdir"]+name, []byte(content), 0744)
}

//Potential issue here because POST requests tend to have size limits
func hostnameOut(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	io.WriteString(w, string(hostname))
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

func socketServer(s *websocket.Conn) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	com := exec.Command("python3", config["projectdir"]+string(data[:n])) //[:n] to cut out padding
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
			if err.Error() == "read /dev/ptmx: input/output error" {
				break
			}
			s.Write([]byte("error: " + err.Error()))
		} else if n > 0 {
			s.Write([]byte("output: " + string(out[:n])))
		}
		time.Sleep(time.Millisecond * 100) //For minimal CPU impact
	}
	s.Close()
}
