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

# Utility function to read the README file.
def read(fname):
    return open(os.path.join(os.path.dirname(__file__), fname)).read()

TGT_INSTALL_DIR = '/opt/raspberrystem/ide'
TGT_HTML_DIR = '/var/local/raspberrystem/ide/website'
TGT_CONFIG_FILE = '/etc/rstem_ide.conf'
TGT_BIN_SYMLINK = '/usr/local/bin/rstem_ide_server'
outputs = [
    TGT_INSTALL_DIR,
    TGT_HTML_DIR,
    TGT_CONFIG_FILE,
    TGT_BIN_SYMLINK,
    ]

def post_install():
    # import rstem to find its install path
    # NOTE: Require dependency on rstem
    import rstem
    api_path = os.path.join(os.path.dirname(rstem.__file__), 'api', rstem.__name__)

    for dir in [TGT_INSTALL_DIR, TGT_HTML_DIR]:
        print('Removing: ' + dir)
        shutil.rmtree(dir, ignore_errors=True)
    for dir in [TGT_INSTALL_DIR, TGT_HTML_DIR]:
        print('Installing: ' + dir)
        shutil.copytree(os.path.basename(dir), dir)

    print('Creating links...')
    # API docs symlink
    api_symlink = os.path.join(TGT_HTML_DIR, 'api')
    try:
        os.remove(api_symlink)
    except OSError:
        pass
    print('  symlink {} -->\n    {}'.format(api_symlink, api_path))
    os.symlink(api_path, api_symlink)
    # server binary symlink
    try:
        os.remove(TGT_BIN_SYMLINK)
    except OSError:
        pass
    dest_bin = os.path.join(TGT_INSTALL_DIR, 'server')
    print('  symlink {} -->\n    {}'.format(TGT_BIN_SYMLINK, dest_bin))
    os.symlink(dest_bin, TGT_BIN_SYMLINK)
    os.chmod(TGT_BIN_SYMLINK, 0o4755)

    if os.path.exists(TGT_CONFIG_FILE):
        print('Config file exists - skipping copy')
    else:
        SRC_CONFIG_FILE = '.' + TGT_CONFIG_FILE
        print('Copying config file {} -> {}', SRC_CONFIG_FILE, TGT_CONFIG_FILE)
        shutil.copy(SRC_CONFIG_FILE, TGT_CONFIG_FILE)

# Post installation task to setup raspberry pi
class install(_install):
    def get_outputs(self):
        return super().get_outputs() + outputs

    def run(self):
        super().run()
        post_install()

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
        'Development Status :: 2 - Pre-Alpha',
        'Topic :: Education',
        'License :: OSI Approved :: Apache Software License',
        'Programming Language :: Python :: 3.2',
        'Programming Language :: Python :: 3.3',
    ],
    cmdclass={'install': install},  # overload install command
)