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
	"syscall"
	"time"
)

var ide *template.Template
var hostname, _ = ioutil.ReadFile("/etc/hostname")

func main() {
	content, err := ioutil.ReadFile("/etc/ide/ide.html") //ide.html is actually a go template
	if err != nil {
		panic(err)
	}
	ide, err = template.New("page").Parse(string(content))
	if err != nil {
		panic(err)
	}
	http.HandleFunc("/", index) //All requests to / and 404s will route to Index
	http.HandleFunc("/ide.js", ideJs)
	http.HandleFunc("/cm.js", cmJs)
	http.HandleFunc("/cm.css", cmCss)
	http.HandleFunc("/mode.js", mode)
	http.HandleFunc("/theme.css", theme)
	http.HandleFunc("/api/listfiles", listFiles)
	http.HandleFunc("/api/readfile", readFile)
	http.HandleFunc("/api/savefile", saveFile)
	http.Handle("/api/socket", websocket.Handler(socketServer))
	http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir("/etc/ide/assets/images"))))
	err = http.ListenAndServe(":80", nil)
	if err != nil {
		panic(err)
	}
}

//Returns requests to /
func index(w http.ResponseWriter, r *http.Request) {
	data := map[string]string{
		"title": "RStem IDE@" + string(hostname),
	}
	ide.ExecuteTemplate(w, "page", data)
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

func theme(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/solarized.css")
}

func mode(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "/etc/ide/assets/cmirror/python.js")
}

func listFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	files, _ := ioutil.ReadDir("/projects/")
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
	fname := opts.Get("file")
	contents, err := ioutil.ReadFile("/projects/" + fname)
	if err != nil {
		io.WriteString(w, "error")
		return
	}
	io.WriteString(w, string(contents))
}

func saveFile(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	name := r.Form.Get("file")
	content := r.Form.Get("content")
	ioutil.WriteFile("/projects/"+name, []byte(content), 0744)
}

func watchClose(s *websocket.Conn, p *os.Process) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	payload := string(data[:n])
	if payload == "close" {
		p.Signal(syscall.SIGINT)
	}
}

func socketServer(s *websocket.Conn) {
	data := make([]byte, 512)
	n, _ := s.Read(data)
	com := exec.Command("python3", "/projects/"+string(data[:n]))
	pt, err := pty.Start(com)
	if err != nil {
		s.Write([]byte("error: " + err.Error()))
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
		time.Sleep(time.Millisecond * 100)
	}
	s.Close()
}
