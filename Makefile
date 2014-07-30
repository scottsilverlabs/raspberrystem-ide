#
# Requires:
#	- go (golang.org)
#	- To use "go get", first setup (optional):
#		mkdir ~/.go
#		export GOPATH=~/.go
#	- Mercurial (hg) required by "go get":
#		- http://mercurial.selenic.com/wiki/Download:
#			sudo port install mercurial
#	- go imports:
#		go get github.com/kr/pty
#		
PI=pi@raspberrypi

.PHONY: all clean install pi-install deb is_go_installed

all: install

clean:
	rm -f server
	rm -f payload.tar.gz
	rm -rf /tmp/idebuild

is_go_installed:
	@which go > /dev/null

run:
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild go run ./server.go

install: is_go_installed
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild go build ./server.go
	cp ./server /usr/bin/ideserver
	mkdir -p /etc/ide
	- cp -R sitescrape/website /etc/ide
	cp -R assets /etc/ide/
	cp *.html /etc/ide/
	cp settings.conf /etc/ide/

pi-install:
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild GOARCH=arm GOARM=5 go build ./server.go
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./ide.html ./api.html ./settings.conf ./sitescrape/website
	ssh $(PI) "mkdir /etc/ide/; cd /etc/ide; tar -xzf -; mv ./server /usr/bin/ideserver" < ./payload.tar.gz

define sshpayload
cat - > ./raspberrystem-ide-1.0.0.tar.gz; \
mkdir raspberrystem-ide-1.0.0; \
cd raspberrystem-ide-1.0.0; \
tar -xzf ../raspberrystem-ide-1.0.0.tar.gz; \
dh_make -e stephan@raspberrystem.com --s -y -c apache -f ../raspberrystem-ide-1.0.0.tar.gz; \
cp debrules debian/rules; \
cp debcontrol debian/control; \
dpkg-buildpackage;
endef

deb:
	GOARCH=arm GOARM=5 go build ./server.go
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./debrules ./debcontrol ./ide.html ./api.html ./settings.conf ./sitescrape/website
	ssh $(PI) "$(sshpayload)" < payload.tar.gz > raspberrystem-ide_1.0.0-1_armhf.deb
	ssh $(PI) "cat raspberrystem-ide_1.0.0-1_armhf.deb; rm -rf raspberrystem-* &> /dev/null;"> raspberrystem-ide_1.0.0-1_armhf.deb
