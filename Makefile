PI=pi@raspberrypi

.PHONV: all clean install pi-install deb run

clean:
	- rm server
	- rm payload.tar.gz
	- rm -r /tmp/idebuild

run:
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild go run ./server.go

install:
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild go build ./server.go
	sudo cp ./server /usr/bin/ideserver
	- sudo mkdir /etc/ide
	- cp -R sitescrape/website /etc/ide
	sudo cp -R assets /etc/ide/
	sudo cp *.html /etc/ide/
	sudo cp settings.conf /etc/ide/

pi-install:
	GOPATH=/tmp/idebuild go get github.com/kr/pty
	GOPATH=/tmp/idebuild go get code.google.com/p/go.net/websocket
	GOPATH=/tmp/idebuild GOARCH=arm GOARM=5 go build ./server.go
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./ide.html ./settings.conf ./sitescrape/website
	ssh $(PI) "sudo mkdir /etc/ide/; cd /etc/ide; sudo tar -xzf -; sudo mv ./server /usr/bin/ideserver" < ./payload.tar.gz

define sshpayload
mkdir /tmp/builddir; \
cd /tmp/builddir; \
cat - > raspberrystem.tar.gz; \
mkdir -p debian/DEBIAN; \
mkdir -p debian/usr/bin; \
mkdir -p debian/etc/ide; \
tar -xzf raspberrystem.tar.gz; \
mv debcontrol debian/DEBIAN/control; \
mv server debian/usr/bin/ideserver; \
mv assets debian/etc/ide; \
mv sitescrape/website debian/etc/ide/; \
mv settings.conf debian/etc/ide; \
mv ide.html debian/etc/ide; \
sudo dpkg-deb --build debian > /dev/null; \
cat debian.deb;
endef

deb:
	GOARCH=arm GOARM=5 go build ./server.go
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./debcontrol ./ide.html ./settings.conf ./sitescrape/website
	ssh $(PI) "$(sshpayload)" < payload.tar.gz > raspberrystem.deb
	ssh $(PI) "sudo sudo rm -r /tmp/builddir"
