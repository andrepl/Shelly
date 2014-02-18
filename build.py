import json
import re
import sys
import subprocess
import os
import shutil
from optparse import OptionParser


js_src = [
    'bower_components/jquery/dist/jquery.js',
    'bower_components/jsSHA/src/sha256.js',
    'bower_components/ericmmartin.simplemodal/src/jquery.simplemodal.js',
    'bower_components/codemirror/lib/codemirror.js',
    'bower_components/codemirror/mode/python/python.js',
    'bower_components/codemirror/addon/comment/comment.js',
    'bower_components/codemirror/addon/fold/comment-fold.js',
    'bower_components/codemirror/addon/fold/foldcode.js',
    'src/draggable.js',
]


target = os.path.join('build', 'Shelly')

def clean():
    try:
        shutil.rmtree('build')
    except OSError:
        pass
    os.makedirs(os.path.join(target, 'images'))

def write_shelly_js():
    body, js = None, None
    with open(os.path.join('src', 'shelly.html'), 'r') as htmlfile:
        body = htmlfile.read()

    with open(os.path.join('src', 'shelly.js'), 'r') as jsfile:
        js = jsfile.read().replace('"__BODY__"', repr(body));

    with open(os.path.join('build', 'shelly.js'), 'w') as outfile:
        outfile.write(js)

def get_icon_size(image_path):
    match = re.match(r'^icon(\d+)\.png$', os.path.basename(image_path))
    if match:
        return int(match.groups()[0])

def write_manifest(content_scripts, icons):
    with open(os.path.join("src", "manifest.json"), 'r') as orig_manifest_file:
        manifest = json.load(orig_manifest_file)
    manifest["content_scripts"] = [{
        'matches': manifest["content_scripts"][0]["matches"],
        'js': content_scripts,
        'css': manifest["content_scripts"][0]["css"]
    }]
    manifest["icons"] = {str(get_icon_size(i)): i for i in icons}
    with open(os.path.join(target, "manifest.json"), 'w') as out_manifest:
        json.dump(manifest, out_manifest, indent=4)

def write_content_scripts(compress):
    content_scripts = []
    if compress:
        # uglify and copy resources
        subprocess.call(['uglifyjs'] + js_src + ['build/shelly.js',
                                                 "-c", "-m", "--ascii", "-o",
                                                 os.path.join(target, "shelly.js")])
        content_scripts = ["shelly.js"]
        os.unlink(os.path.join("build", "shelly.js"))
    else:
        for f in js_src:
            content_scripts.append(os.path.basename(f))
            shutil.copy(f, target)
        f = os.path.join("build", "shelly.js");
        shutil.copy(f, target);
        content_scripts.append("shelly.js");
    return content_scripts

def copy_assets():
    shutil.copy(os.path.join('src', 'shelly.css'), target)
    shutil.copy(os.path.join('src', 'font-awesome.css'), target)
    shutil.copy(os.path.join('src', 'fontawesome-webfont.svg'), target)

def copy_icons():
    icons = []
    for f in os.listdir(os.path.join('src', 'images')):
        if f.startswith("icon") and f.endswith(".png"):
            icons.append(os.path.join("images", f))
            shutil.copy(os.path.join('src', 'images', f), os.path.join(target, 'images'))
    return icons


def build(options):
    clean()
    write_shelly_js()
    content_scripts = write_content_scripts(options.compress)
    copy_assets()
    write_manifest(content_scripts, copy_icons())


parser = OptionParser()
parser.add_option("-c", "--no-compress",
                  action="store_false", dest="compress", default=True,
                  help="Don't compress, run from source")


if __name__ == "__main__":
    options, args = parser.parse_args()
    build(options)
