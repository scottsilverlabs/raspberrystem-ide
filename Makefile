#
# Requires:
#	- go (golang.org) (required on host to build/run, required on target to run)
#		- To add Go support on the Pi, in Raspbian:
#			sudo apt-get install golang
#	- Mercurial (hg) required by "go get":
#		- http://mercurial.selenic.com/wiki/Download, for Mac:
#			sudo port install mercurial
#	- Rebuild in linux/arm support for cross-compiling to the Pi.  On the Mac, this works:
#		cd /usr/local/go/src
#		sudo GOOS=linux GOARCH=arm ./make.bash
#		
PI=pi@raspberrypi

PACKAGES=github.com/kr/pty code.google.com/p/go.net/websocket

export GOPATH=$(HOME)/tmp/idebuild

.PHONY: all clean deb
.PHONY: is_go_installed $(PACKAGES)
.PHONY: host run install pi pi-install

all: host

clean:
	rm -f server
	rm -f payload.tar.gz
	rm -rf $(GOPATH)

is_go_installed:
	@which go > /dev/null

$(PACKAGES):
	@if [ ! -d $(GOPATH)/src/$@ ]; then \
		echo go get $@; \
		go get $@; \
	fi

run:
	go run ./server.go

host: is_go_installed $(PACKAGES)
	go build ./server.go

pi: is_go_installed $(PACKAGES)
	GOARCH=arm GOARM=5 GOOS=linux go build ./server.go

install:
	cp ./server /usr/bin/ideserver
	sudo mkdir -p /etc/ide
	sudo chmod 777 /etc/ide
	cp -R sitescrape/website /etc/ide
	cp -R assets /etc/ide/
	cp *.html /etc/ide/
	cp settings.conf /etc/ide/

pi-install:
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz \
		./server ./assets ./ide.html ./settings.conf ./sitescrape/website
	ssh $(PI) "\
		sudo mkdir -p /etc/ide/; \
		sudo chmod 777 /etc/ide; \
		cd /etc/ide; tar -xzf -; \
		sudo mv ./server /usr/bin/ideserver \
		" < ./payload.tar.gz

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

deb: pi
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./debcontrol ./ide.html ./settings.conf ./sitescrape/website
	ssh $(PI) "$(sshpayload)" < payload.tar.gz > raspberrystem.deb
	ssh $(PI) "sudo sudo rm -r /tmp/builddir"
