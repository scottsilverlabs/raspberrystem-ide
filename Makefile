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
#
# Installation layout:
#	- Installed via pip
#		/opt/raspberrystem/ide - IDE server and resources
#		/etc/rstem_ide.conf - IDE config
#		/var/local/raspberrystem/ide/website - top-level html
#		/usr/local/bin/rstem_ide_server - Link to IDE server
#	- Dependency of lesson plans pip install
#	- Depends on raspberrystem pip install
#
PYTHON=python3
SETUP=$(PYTHON) setup.py
PIP=pip-3.2

PI=pi@raspberrypi
RUNONPI=ssh $(SSHFLAGS) -q -t $(PI) "cd rsinstall;"

PACKAGES=github.com/kr/pty code.google.com/p/go.net/websocket

export GOPATH=$(HOME)/tmp/idebuild

# Create version name
DUMMY:=$(shell scripts/version.sh)

# Name must be generated the same way as setup.py
NAME:=$(shell cat NAME)
VER:=$(shell cat VERSION)

IDE_SOURCE_FILES=$(shell git ls-files assets ide.html)
# Final targets
IDE_TAR:=$(abspath $(NAME)-$(VER).tar.gz)
TARGETS=$(IDE_TAR)

# Dependency files
GIT_FILES=$(shell git ls-files)

.PHONY: all is_go_installed $(PACKAGES)

all: $(TARGETS)

#########################################################################
# Prerequisites
#

is_go_installed:
	@which go > /dev/null

$(PACKAGES):
	@if [ ! -d $(GOPATH)/src/$@ ]; then \
		echo go get $@; \
		go get $@; \
	fi

#########################################################################
# Pi targets
#

.PHONY: run targets clean install

run:
	$(RUNONPI) "(sudo killall rstem_ide_server; exit 0)"
	$(RUNONPI) "sudo rstem_ide_server" &

server: server.go | is_go_installed $(PACKAGES)
	GOARCH=arm GOARM=5 GOOS=linux go build $<

ide/server: server $(IDE_SOURCE_FILES)
	$(eval DIR=$(dir $@))
	rm -rf $(DIR)
	mkdir -p $(DIR)
	@for f in $(IDE_SOURCE_FILES); do \
		mkdir -p ide/`dirname $$f`; \
		cp -v $$f $(DIR)/$$f; \
	done
	cp $< $@

$(IDE_TAR): ide/server $(GIT_FILES)
	$(SETUP) sdist
	mv dist/$(notdir $@) $@

targets:
	@echo $(TARGETS)

install:
	scp $(IDE_TAR) $(PI):/tmp
	-$(RUNONPI) sudo $(PIP) uninstall -y $(NAME)
	$(RUNONPI) sudo $(PIP) install /tmp/$(notdir $(IDE_TAR))

clean:
	rm -rf ide
	rm NAME VERSION
	rm -f server
	rm -f *.tar.gz
	rm -rf *.egg-info
	rm -rf __pycache__
	rm -f $(TARGETS)
	rm -rf $(GOPATH)

#########################################################################
# local targets
#

.PHONY: local local-install local-run

local: is_go_installed $(PACKAGES)
	go build ./server.go

local-install:
	cp ./server /usr/bin/ideserver
	sudo mkdir -p /etc/ide
	sudo mkdir -p /var/local/raspberrystem/ide/
	sudo mkdir -p /opt/raspberrystem/ide/
	sudo chmod 777 /etc/ide
	cp -R sitescrape/website /etc/ide
	cp -R assets /opt/raspberrystem/ide/
	cp *.html /opt/raspberrystem/ide/
	cp settings.conf /etc/ide/

local-run:
	go run ./server.go

#########################################################################
# Deprecated targets
#

.PHONY: old-install deb

old-install:
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

deb: server
	- mkdir ./sitescrape/website
	tar -czf payload.tar.gz ./server ./assets ./debcontrol ./ide.html ./settings.conf ./sitescrape/website
	ssh $(PI) "$(sshpayload)" < payload.tar.gz > raspberrystem.deb
	ssh $(PI) "sudo sudo rm -r /tmp/builddir"
