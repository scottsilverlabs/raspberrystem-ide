var save, GET, POST, type, changeHandle, changeSocket, openFile, removePopup,
	changeSocketInit; //Function prototypes
var url = document.location.host; //The URL is needed for the web socket connection

window.onload = function main() {
	if (window.MozWebSocket) {
		window.WebSocket = window.MozWebSocket;
	}
	codewrapper = document.getElementById("codewrapper");
	output = document.getElementById("output");
	outputtext = document.getElementById("output").firstChild;
	playButton = document.getElementById("play");
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	if (url != "127.0.0.1" && url != "localhost") {
		document.getElementById("browser").parentNode.removeChild(document
			.getElementById("browser"));
		document.getElementById("webview").parentNode.removeChild(document
			.getElementById("webview"));
		document.getElementById("outputToggle").style.marginLeft = "-1.75em";
	}
	titleHolder = document.getElementById("title");
	editor = CodeMirror(document.getElementById("codewrapper"), {
		mode: {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		},
		autofocus: true,
		lineNumbers: true,
		undoDepth: 20, //Default: 40
		indentUnit: 4,
		indentWithTabs: true,
		matchBrackets: true,
		theme: "solarized-dark",
		textWrapping: true,
		pollInterval: 300,
		workDelay: 400, //Default: 300
		viewportMargin: 3, //Default: 10
	});
	themes = editor.options.theme.split(" ");
	for (var i in themes) {
		output.classList.add("cm-s-"+themes[i]);
	}
	editor.on("change", changeHandle);
	filename = "Untitled.py";
	if (GET("/api/listfiles").split("\n")[0] === "") {
		save(); //Create untitled document
	}
	changeSocketInit();
};

window.onbeforeunload = function (event) {
	save();
	changeSocket.close();
};

function key(k) {
	if (k.keyCode == 27) {
		removePopup();
	}
}

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

function save() {
	if (filename !== "") {
		POST("/api/savefile", {"file": filename, "content": editor.getValue()});
	}
}

//Called when the script stops running on the server side

var errs = [];
var errRegex = new RegExp(/\s+File ".+", line \d+.*\n.+\n.+\^\n.+: .+/g);
var traceRegex = new RegExp(/Traceback \(most recent call last\):\n(\s+File ".+", line \d+.*\n.*\n)+.+: .+/g);
var stripRegex = new RegExp(/(^\s+|\s+$)/g);
function errorHighlight() {
	var errString = outputtext.innerHTML;
	var lines = errString.split("\n");
	var errors = errString.match(errRegex);
	for (var i = 0; errors && i < errors.length; i++) {
		var err = errors[i];
		var errLines = err.split("\n");
		var errLinePos = errLines[0].split(", ")[1].substring(5);
		var line = editor.lineInfo(errLinePos-1);
		var stripped = errLines[1].replace(stripRegex, "");
		var match = line.text.indexOf(stripped);
		var start = {"line": errLinePos-1, "ch": match};
		var end = {"line": errLinePos-1, "ch": match+stripped.length};
		errs.push(editor.markText(start, end, {
			className: "cm-error",
			clearOnEnter: true,
			title: errLines[3],
		}));
		if (i === 0) {
			editor.scrollTo(0, errLinePos);
		}
	}
	var traces = errString.match(traceRegex);
	for (var j = 0; traces && j < traces.length; j++) {
		var split = traces[j].split("\n");
		var message = split[0];
		for (var i = 1; i < split.length-1; i++) {
			var line = split[i];
			if (i%2 !== 0) {
				var end = 0;
				for (var k = 8; k < line.length; k++) {
					if (line.substr(k, 1) == "\"") {
						end = k;
					}
				}
				message += "\n"+line.substring(0, 8)+"<span class=\"cm-variable\">"
					+line.substring(8, end)+"</span>";
				var nextend = end+8;
				while (parseInt(line.substr(nextend, 1)) || line.substr(nextend, 1) == "0")
					nextend++;
				message += line.substring(end, end+8) + "<span class=\"cm-variable\">"
					+ line.substring(end+8, nextend) + "</span>" + line.substring(nextend);
				if (line.substring(end-filename.length, end) == filename) {
					var lnum = parseInt(line.substring(end+8, nextend))-1;
					var start = {"line": lnum, "ch": 0};
					var end = {"line": lnum, "ch": editor.getLine(lnum).length};
					errs.push(editor.markText(start, end, {
						className: "cm-error",
						clearOnEnter: true,
						title: "Traceback",
					}));
					editor.scrollTo(0, lnum);
				}
			} else {
				message += "\n"+"<span class=\"cm-variable\">"+line+"</span>";
			}
		}
		outputtext.innerHTML = outputtext.innerHTML.replace(traces[j], 
			"<span style=\"color:red;\">"+message+"</span>");
	}
}

function sprColor(change) {
	var baseline = change.from.line;
	var ldiff = change.to.line - change.from.line;
	if (ldiff == 0 && change.text.length == 2) {
		var marks = editor.findMarksAt({line: baseline+1, ch: 0});
		for (var i = 0; i < marks.length; i++) {
			marks[i].clear();
		}
		var ch = editor.getLine(baseline+1).substring(0, 1).toLowerCase();
		var code = ch.charCodeAt(0);
		var start = {"line": baseline+1, "ch": 0};
		var end = {"line": baseline+1, "ch": 1};
		if ((parseInt(ch) && ch !== 0) || (code < 103 && code > 96)) {
			editor.markText(start, end, {
				className: "spr"+ch,
			});
		} else if (ch != "-" && ch != " " && ch != "0") {
			editor.markText(start, end, {
				className: "sprerr",
			});
		} 
	}
	for (var i = 0; i <= ldiff; i++) {
		var line = editor.getLine(baseline+i);
		var schar = 0;
		var echar = line.length;
		if (i === 0) {
			schar = change.from.ch;
		} else if (i == ldiff) {
			echar = change.to.ch;
		}
		for (var j = schar; j < echar; j++) {
			var ch = line.substring(j, j+1).toLowerCase();
			var code = ch.charCodeAt(0);
			var start = {"line": baseline+i, "ch": j};
			var end = {"line": baseline+i, "ch": j+1};
			if (((parseInt(ch) && ch !== 0 ) || (code < 103 && code > 96)) 
				&& (j === 0 || line.substring(j-1, j) == " ")) {
				editor.markText(start, end, {
					className: "spr"+ch,
				});
			} else if (ch != "-" && ch != " " && ch != "0" || (ch != " " 
				&& j !== 0 && line.substring(j-1, j) != " ")) {
				editor.markText(start, end, {
					className: "sprerr",
				});
			}
		}
	}
}

var last = null;
function changeHandle(cm, change) {
	if (type == "spr") {
		sprColor(change);
	}
	if (changeSocket !== null && last === null && change.origin != "setValue") {
		var text = "";
		for (var i in change.text) {
			text += "\n"+change.text[i];
		}
		changeSocket.send("CIF:" + change.from.line + "," + change.from.ch + ","
			+ change.to.line + "," + change.to.ch + "," + text.substring(1));
	} else {
		last = null;
	}
}

//Creates socket connection to the server and sends the filename
var ws = null;
function socket() {
	ws = new WebSocket("ws://"+url+"/api/socket");
	ws.onopen = function (event) {
		while ((a = errs.pop()) !== undefined) {
			a.clear();
		}
		ws.send(filename);
		playButton.src = "/images/stop.png";
	};
	ws.onclose = function (event) {
		ws = null;
		errorHighlight();
		playButton.src = "/images/play.png";
	};
	ws.onmessage = function (event) {
		message = event.data;
		if (message.substring(0, 8) == "output: ") {
			outputtext.innerHTML += message.substring(8).replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
			output.scrollTop = output.scrollHeight;		
			return;
		} else if (message.substring(0, 7) == "error: ") {
			messageActual = message.substring(7).replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
			outputtext.innerHTML += "<span style=\"color:red;\">SERVER ERROR:";
			outputtext.innerHTML += messageActual;
			outputtext.innerHTML += "</span>\n";
			output.scrollTop = output.scrollHeight;
		}
	};
}

function changeSocketInit() {
	changeSocket = new WebSocket("ws://"+url+"/api/change");
	changeSocket.onopen = function (event) {
		changeSocket.send("COF:"+filename);
		good = true;
	};
	changeSocket.onclose = function (event) {
		changeSocket = null;
		if (good) {
			setTimeout(changeSocketInit, 5000);
		}
	};
	changeSocket.onerror = function (event) {
		if (!good) {
			alert("Your browser may not support web sockets\nFor the best experience use Google Chrome");
		}
	};
	changeSocket.onmessage = function (event) {
		message = event.data;
		if (message == "FILE") {
			var pos = editor.getCursor();
			changeSocket.send("FILE:"+editor.getValue());
			editor.setCursor(pos);
		} else if (message.substring(0, 5) == "FILE:") {
			editor.setValue(message.substring(5));
		} else if (message.substring(0, 6) == "USERS:") {
			var num = parseInt(message.substring(6));
			if (num > 1) {
				titleHolder.innerHTML = filename.replace(/\-/g, " ") + " - "
					+ num + " Users";
			} else {
				titleHolder.innerHTML = filename.replace(/\-/g, " ");
			}
		} else {
			var arr = message.split(",");
			var content = message.substring((arr[0]+arr[1]+arr[2]+arr[3]).length+4);
			last = content;
			for (var i = 0; i < 4; i++) {
				arr[i] = parseInt(arr[i]);
			}
			if (editor.lastLine() < parseInt(arr[0])) {
				editor.setValue(editor.getValue()+"\n");
			}
			editor.replaceRange(content, {line:arr[0], ch:arr[1]}, {line:arr[2]
				, ch:arr[3]});
		}
	};
}

//Outputs graphical version of sprite file
var sprColorRegex = new RegExp(/[0-9a-fA-F\-]/);
function runSpr() {
	var val = editor.getValue();
	var lines = val.split("\n");
	var valhtml = "";
	for (var i in lines) {
		var line = lines[i].split(" ");
		valhtml += "<div style=\"margin-bottom:0.2em;\">";
		for (var j in line) {
			if (line[j] !== "" && (line[j].match(sprColorRegex) === null
				|| line[j].match(sprColorRegex)[0] != line[j])) {
				outputtext.innerHTML += "<span style=\"color:red;\">ERROR at line "
					 + (parseInt(i)+1)+": invalid color \""+line[j]+"\"";
				return;
			} else if (line[j] !== "") {
				if (line[j] == "-")
					line[j] = "0";
				valhtml += "<span style=\"color:#"+line[j]+line[j]+"0000;\">⬤</span>";
			}
		}
		valhtml += "</div>";
	}
	outputtext.innerHTML += valhtml;
}

//Called by the run button
function run() {
	if (ws === null){
		save();
		outputtext.innerHTML = "";
		if (type != "spr") {
			socket();
		} else {
			runSpr();
		}
	} else {
		ws.send("close");
	}
}

//Called by the web button
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

//Removes popups
var back, popup, text, menu;
function removePopup() {
	if (back !== null) {
		back.parentNode.removeChild(back);
		popup.parentNode.removeChild(popup);
	}
}

//Called when the newFile okay button is pressed
function fileButton() {
	type = menu.value;
	titleHolder.innerHTML = text.value + "." + type;
	filename = titleHolder.innerHTML.replace(/ /g, "-");
	if (type === "py") {
		editor.setOption("mode", {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		});
		editor.setValue("");
	} else if (type === "spr") {
		var val = "\n- - - - - - - -";
		for (var i = 0; i < 3; i++) {
			val = val+val;
		}
		editor.setValue(val.substring(1));
		editor.setOption("mode", null);
	} else if (type === "sh") {
		editor.setValue("");
		editor.setOption("mode", "shell");
	}
	if (changeSocket !== null) {
		changeSocket.send("COF:"+filename);
	}
	removePopup();
	save();
}

function deleteFile(fname, yes) {
	if (yes) {
		POST("/api/deletefile", {"file": fname});
	}
	removePopup();
	openFile();
}

function deletePrompt(fname) {
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
	title.classList.add("maincolor");
	title.innerHTML = "Delete";

	text = document.createElement("div");
	popup.appendChild(text);
	text.classList.add("deletetext");
	text.innerHTML = "Delete "+fname+"?";

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("fileokay");
	okay.onclick = new Function("deleteFile(\""+fname+"\", true)");
	okay.innerHTML = "Yes";

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "No";
	cancel.classList.add("filecancel");
	cancel.onclick = new Function("deleteFile(\""+fname+"\", false)");
}

//Caled by the new file button in the open file popup
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
	title.classList.add("maincolor");
	title.innerHTML = "New File";

	text = document.createElement("input");
	popup.appendChild(text);
	text.classList.add("filetext");
	text.type = "text";

	menu = document.createElement("select");
	popup.appendChild(menu);
	menu.classList.add("filetype");
	menu.innerHTML = '<option value="py">.py</option>';
	menu.innerHTML += '<option value="spr">.spr</option>';
	menu.innerHTML += '<option value="sh">.sh</option>';

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

//Called when a file div is clicked in the open file popup
function loadFile(div) {
	if (filename != div.innerHTML) {
		save();
	}
	filename = div.innerHTML.replace(/ /g, "-");
	var sp = filename.split(".");
	type = sp[sp.length-1];
	if (type == "py") {
		editor.setOption("mode", {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		});
	}
	if (type == "sh") {
		editor.setOption("mode", "shell");
	}
	titleHolder.innerHTML = div.innerHTML;
	var contents = GET("/api/readfile?file="+filename);
	editor.setValue(contents);
	if (type == "spr") {
		editor.setOption("mode", null);
		var lines = editor.lineCount();
		sprColor({
			from: {line: 0, ch: 0},
			to: {line: lines-1, ch: editor.getLine(lines-1).length},
			text: "abcd",
		});
	}
	if (changeSocket !== null) {
		changeSocket.send("COF:"+filename);
	}
	removePopup();
}

//Called by the open file button
function openFile() {
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
	title.classList.add("maincolor");
	title.innerHTML = "Select File";

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
			filediv.innerHTML = files[i].replace(/-/g, " ");
			filediv.classList.add("filediv");
			filediv.classList.add("maincolor");
			filediv.onclick = new Function("loadFile(this)");
			if (files[i] != "Untitled.py") {
				var deleteDiv = document.createElement("div");
				fileholder.appendChild(deleteDiv);
				deleteDiv.innerHTML = "X";
				deleteDiv.classList.add("deleteDiv");
				deleteDiv.onclick = new Function("deletePrompt(\""+files[i]+"\")");
			} else {
				filediv.classList.add("untitleddiv");
			}
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

//Called when a div is clicked in the change theme function
function setTheme(obj) {
	name = obj.innerHTML.toLowerCase().replace(/ /g, "-");
	document.getElementById("theme").href = "/themes/"+name+".css";
	old = editor.getOption("theme");
	editor.setOption("theme", name);
	output.classList.remove("cm-s-"+old);
	output.classList.add("cm-s-"+name);
	removePopup();
}

//Called by the change theme button
function changeTheme() {
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
	title.classList.add("maincolor");
	title.innerHTML = "Select Theme";

	var fileholder = document.createElement("div");
	popup.appendChild(fileholder);
	fileholder.classList.add("fileholder");

	//Files
	files = GET("/api/listthemes").split("\n");
	if (files[0] === "") {
		//TODO No Files Found Error
	} else {
		for (var i in files) {
			var filediv = document.createElement("div");
			fileholder.appendChild(filediv);
			filediv.innerHTML = files[i].replace(/-/g, " ").replace(/\.css/g, "");
			filediv.classList.add("filediv");
			filediv.classList.add("maincolor");
			filediv.onclick = new Function("setTheme(this)");
		}
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("foldercancel");
	cancel.onclick = removePopup;
}

var open = true;
function toggleOutput() {
	if (open) {
		output.classList.remove("outputOpen");
		output.classList.add("outputClosed");
		codewrapper.classList.remove("codeShort");
		codewrapper.classList.add("codeLong");
	} else {
		output.classList.remove("outputClosed");
		output.classList.add("outputOpen");
		codewrapper.classList.remove("codeLong");
		codewrapper.classList.add("codeShort");
	}
	open = !open;
}