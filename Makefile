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
#		/usr/local/bin/rstem_ided - Link to IDE server
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

IDE_SOURCE_FILES=$(shell git ls-files assets ide.html start_client.sh)
# Final targets
IDE_TAR:=$(abspath $(NAME)-$(VER).tar.gz)
TARGETS=$(IDE_TAR)

# Dependency files
GIT_FILES=$(shell git ls-files)
# GIT_GRAFTABLES are all directories in git that get directly grafted into the
# source dist via the MANIFEST file.  We need to know these because we'll
# git-clean them before building - otherwise, misc cruft can get into out dist.
GIT_GRAFTABLES=python.org etc configfiles website pkg

.PHONY: all is_go_installed $(PACKAGES)

# Default target
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
# Targets
#

.PHONY: run targets clean install

pushpg:
	ssh swolski@raspberrystem.com mkdir -p raspberrystem.com/assets
	scp -r assets/* swolski@raspberrystem.com:raspberrystem.com/assets

run:
	$(RUNONPI) "(sudo killall rstem_ided; exit 0)"
	$(RUNONPI) "sudo rstem_ided" &

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
	git clean -dxf $(GIT_GRAFTABLES)
	$(SETUP) sdist
	mv dist/$(notdir $@) $@

upload:
	$(SETUP) sdist upload

register:
	$(SETUP) register

targets:
	@echo $(TARGETS)

uninstall:
	$(RUNONPI) sudo $(PIP) uninstall -y $(NAME)

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

