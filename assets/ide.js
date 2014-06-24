//TODO error highlighting
//Improve the UI and UX
//Linting?
//Optimize CM
//API Docs
var codewrapper, output, ide, editor, web, titleHolder, playButton;
//The URL is needed for the web socket connection
var url = document.baseURI.match(/\/\/[a-zA-Z0-9\.]+/)[0].substring(2);
window.onload = function main() {
	codewrapper = document.getElementById("codewrapper");
	output = document.getElementById("output");
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	playButton = document.getElementById("play");
	titleHolder = document.getElementById("title");
	editor = CodeMirror(document.getElementById("codewrapper"), {
		mode: {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		},
		lineNumbers: true,
		indentUnit: 4,
		matchBrackets: true,
		theme: "solarized dark",
		textWrapping: true,
	});
	themes = editor.options.theme.split(" ");
	for (var i in themes) {
		output.classList.add("cm-s-"+themes[i]);
	}
};

function GET(url) {  
	var req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.send(null);
	return req.responseText;
}

function POST(url, args) {  
	argsActual = "";
	for (var i in args) {
		argsActual += "&"+i+"="+encodeURIComponent(args[i]);
	}
	argsActual = argsActual.substring(1);
	var req = new XMLHttpRequest();
	req.open("POST", url, false);
	req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	req.send(argsActual);
	return req.responseText;
}

var filename = "Untitled";
function save() {
	if (filename !== "") {
		POST("/api/savefile", {"file": filename, "content": editor.getValue()});
	}
}

var ws = null;
function socket() {
	ws = new WebSocket("ws://"+url+"/api/socket");
	ws.onopen = function (event) {
		console.log("Open");
		console.log(filename);
		ws.send(filename);
		playButton.src = "/images/stop.png";
	};
	ws.onclose = function (event) {
		console.log("Close");
		ws = null;
		playButton.src = "/images/play.png";
	};
	ws.onmessage = function (event) {
		message = event.data;
		if (message.substring(0, 8) == "output: ") {
			messageActual = message.substring(8);
			output.innerHTML += messageActual.replace(/\r\n/g, "<br>").replace(/\n/g, "<br>");
			output.scrollTop = output.scrollHeight;
			return;
		} else if (message.substring(0, 7) == "error: ") {
			messageActual = message.substring(7);
			output.innerHTML += "<span style=\"color:red;\">SERVER ERROR:";
			output.innerHTML += messageActual.replace(/\r\n/g, "<br>").replace(/\n/g, "<br>");
			output.innerHTML += "</span>";
			output.scrollTop = output.scrollHeight;
		}
	};
}

function run() {
	if (ws === null){
		save();
		output.innerHTML = "";
		socket();
	} else {
		ws.send("close");
	}
}

var webShowing = false;
function toggleWeb() {
	webShowing = !webShowing;
	if (webShowing){
		codewrapper.style.width = "50%";
		output.style.width = "50%";
		web.style.width = "50%";
		web.style.left = "50%";
	} else {
		codewrapper.style.width = "100%";
		output.style.width = "100%";
		web.style.width = "0";
		web.style.left = "100%";
	}
}

var back, popup, text;
function removePopup() {
	back.parentNode.removeChild(back);
	popup.parentNode.removeChild(popup);
}

//Called when the newFile okay button is pressed
function fileButton() {
	titleHolder.innerHTML = text.value;
	filename = text.value.replace(/ /g, "-").replace(/\.py/g, "") + ".py";
	removePopup();
}

function newFile() {
	removePopup();
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.innerHTML = "New File";

	text = document.createElement("input");
	popup.appendChild(text);
	text.classList.add("filetext");
	text.type = "text";

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("fileokay");
	okay.onclick = fileButton;
	okay.innerHTML = "Save";

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("filecancel");
	cancel.onclick = removePopup;
}

function loadFile(div) {
	filename = div.innerHTML;
	titleHolder.innerHTML = filename;
	contents = GET("/api/readfile?file="+filename);
	editor.setValue(contents);
	removePopup();
}

function openFile() {
	save();
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("folderpopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.innerHTML = "Open File";

	var fileholder = document.createElement("div");
	popup.appendChild(fileholder);
	fileholder.classList.add("fileholder");

	//Files
	files = GET("/api/listfiles").split("\n");
	if (files[0] === "") {
		//TODO No Files Found Error
	} else {
		for (var i in files) {
			var filediv = document.createElement("div");
			fileholder.appendChild(filediv);
			filediv.innerHTML = files[i].replace(/-/g, " ").replace(/\.py/g, "");
			filediv.classList.add("filediv");
			filediv.onclick = new Function("loadFile(this)");
		}
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("foldercancel");
	cancel.onclick = removePopup;

	var newfile = document.createElement("div");
	popup.appendChild(newfile);
	newfile.innerHTML = "New";
	newfile.classList.add("foldernew");
	newfile.onclick = newFile;
}