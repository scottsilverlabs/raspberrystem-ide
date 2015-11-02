#!/usr/bin/env python3
#
# Copyright (c) 2014, Scott Silver Labs, LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
import os
import sys
from setuptools import setup, find_packages
from setuptools.command.install import install as _install
import shutil
import subprocess

# Utility function to read the README file.
def read(fname):
    return open(os.path.join(os.path.dirname(__file__), fname)).read()

TGT_CONFIG_FILE = '/etc/rstem_ide.conf'
TGT_INSTALL_DIR = '/opt/raspberrystem/ide'
TGT_PYTHON_DOCS_DIR = '/opt/raspberrystem/python.org'
TGT_HTML_SYMLINK = '/opt/raspberrystem/pydoc'
TGT_CONFIG_FILE = '/etc/rstem_ide.conf'
TGT_BIN_SYMLINK = '/usr/local/bin/rstem_ided'
TGT_INITD = '/etc/init.d/rstem_ided'
TGT_OPENBOX_FILE = '/home/pi/.config/openbox/lxde-pi-rc.xml'
TGT_DESKTOP_FILE = '/home/pi/desktop/openbox/rstem.desktop'
outputs = [
    TGT_INSTALL_DIR,
    TGT_PYTHON_DOCS_DIR,
    TGT_CONFIG_FILE,
    TGT_BIN_SYMLINK,
    TGT_INITD,
    ]

def _post_install(dir):
    # import rstem to find its install path
    # NOTE: Require dependency on rstem
    import rstem
    pydoc_path = os.path.join(os.path.dirname(rstem.__file__), 'pydoc', rstem.__name__)

    for dir in [TGT_INSTALL_DIR, TGT_PYTHON_DOCS_DIR]:
        print('Removing: ' + dir)
        shutil.rmtree(dir, ignore_errors=True)
    for dir in [TGT_INSTALL_DIR, TGT_PYTHON_DOCS_DIR]:
        print('Installing: ' + dir)
        shutil.copytree(os.path.basename(dir), dir)

    print('Creating links...')

    # API docs symlink - note: TGT_HTML_SYMLINK not considered an output of the
    # install because if it is, then on pip uninstall, it will not remove the
    # symlink, but instead removes the files linked TO.
    try:
        os.remove(TGT_HTML_SYMLINK)
    except OSError:
        pass
    print('  symlink {} -->\n    {}'.format(TGT_HTML_SYMLINK, pydoc_path))
    os.symlink(pydoc_path, TGT_HTML_SYMLINK)

    # server binary symlink
    try:
        os.remove(TGT_BIN_SYMLINK)
    except OSError:
        pass
    dest_bin = os.path.join(TGT_INSTALL_DIR, 'server')
    print('  symlink {} -->\n    {}'.format(TGT_BIN_SYMLINK, dest_bin))
    os.symlink(dest_bin, TGT_BIN_SYMLINK)
    os.chmod(TGT_BIN_SYMLINK, 0o4755)

    # Copy config file
    SRC_CONFIG_FILE = '.' + TGT_CONFIG_FILE
    print('Copy config file {} -> {}'.format(SRC_CONFIG_FILE, TGT_CONFIG_FILE))
    shutil.copy(SRC_CONFIG_FILE, TGT_CONFIG_FILE)

    # Copy and create link for init script
    SRC_INITD = '.' + TGT_INITD
    print('Copy init.d script {} -> {}'.format(SRC_INITD, TGT_INITD))
    shutil.copy(SRC_INITD, TGT_INITD)
    os.chmod(TGT_INITD, 0o755)
    # symlink is created via postinstall script

    # WM rc config file
    try:
        os.makedirs("/".join(TGT_OPENBOX_FILE.split("/")[:-1]) + "/")
    except:
        pass
    try:
        print('Backup {} -> {}'.format(TGT_OPENBOX_FILE, TGT_OPENBOX_FILE + '.old'))
        shutil.copy(TGT_OPENBOX_FILE, TGT_OPENBOX_FILE + '.old')
    except:
        pass
    print('Copy {} -> {}'.format("./configfiles/lxde-pi-rc.xml", TGT_OPENBOX_FILE))
    shutil.copy("./configfiles/lxde-pi-rc.xml", TGT_OPENBOX_FILE)

    # Desktop link
    print('Copy {} -> {}'.format("./configfiles/rstem.desktop", TGT_DESKTOP_FILE))
    shutil.copy("./configfiles/rstem.desktop", TGT_DESKTOP_FILE)

    # Additional post install steps via shell script
    from subprocess import call
    call('bash ./pkg/postinstall %s rstem' % dir, shell=True)

# Post installation task to setup raspberry pi
class install(_install):
    # Required to force PiP to know about our additional files.
    def get_outputs(self):
        return super().get_outputs() + outputs

    def run(self):
        super().run()
        self.execute(_post_install, (self.install_lib,), msg='Running post install task...')

setup(
    name = read('NAME').strip(),
    version = read('VERSION').strip(),
    author = 'Brian Silverman',
    author_email = 'bri@raspberrystem.com',
    description = ('RaspberrySTEM IDE'),
    license = 'Apache License 2.0',
    keywords = ['raspberrystem', 'raspberrypi', 'stem', 'ide'],
    url = 'http://www.raspberrystem.com',
    long_description = read('README.md'),
    # use https://pypi.python.org/pypi?%3Aaction=list_classifiers as help when editing this
    classifiers=[
        'Development Status :: 4 - Beta',
        'Topic :: Education',
        'License :: OSI Approved :: Apache Software License',
        'Programming Language :: Python :: 3.2',
        'Programming Language :: Python :: 3.3',
    ],
    cmdclass={'install': install},  # overload install command
)
