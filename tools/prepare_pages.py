"""Validate a public release and stage ONLY website files for GitHub Pages."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
from urllib.parse import unquote

PATH = re.compile(r'/(?:Users|home|Volumes|private|tmp)/|(?<![A-Za-z])[A-Za-z]:[\\/]|touzi_ms_views|workspace/touzi|Workbuddy/',re.I)
ROOT_FILES = ('index.html','pre.html','review.html','.nojekyll')
FOLDERS = ('assets','data','meeting-reports')

def prepare(root, destination):
    root=Path(root).resolve();destination=Path(destination).resolve()
    if destination==root or destination.exists():raise ValueError('Staging must be a new directory')
    manifest=json.loads((root/'site-manifest.json').read_text())
    if manifest.get('repository')!='ms-research-trace':raise ValueError('Wrong release repository')
    for name,digest in manifest['files'].items():
        path=root/name
        if Path(name).is_absolute() or '..' in Path(name).parts or path.is_symlink() or not path.resolve().is_relative_to(root):raise ValueError('Unsafe manifest path')
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Release checksum mismatch: '+name)
    selected=[root/name for name in ROOT_FILES]
    for name in FOLDERS:
        directory=root/name
        if directory.is_symlink():raise ValueError('Symlink folder')
        selected.extend(p for p in directory.rglob('*') if p.is_file() or p.is_symlink())
    public_files={}
    for path in selected:
        name=str(path.relative_to(root))
        if path.is_symlink() or not path.is_file() or name not in manifest['files']:raise ValueError('Unregistered public file: '+name)
        if path.suffix not in ('.html','.css','.js','.json','.webp','.png','.svg','.ico','') or path.name=='.git':raise ValueError('Unsupported public file: '+name)
        if path.suffix in ('.html','.css','.js','.json'):
            text=unquote(unquote(path.read_text()))
            if PATH.search(text):raise ValueError('Private path in '+name)
            if re.search(r'"(?:transcript_text|full_text|raw_text|evidence_text|source_import|local_path|filename)"\s*:',text):raise ValueError('Private field in '+name)
            if path.suffix=='.html':
                if 'name="viewport"' not in text:raise ValueError('Missing responsive viewport')
                if re.search(r'<(?:a|button)\b[^>]*(?:\bdownload|id="(?:download|reviewDownload))',text,re.I):raise ValueError('Download control in '+name)
        public_files[name]=manifest['files'][name]
    destination.mkdir(parents=True)
    for path in selected:
        target=destination/path.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    manifest['files']=public_files
    if os.environ.get('GITHUB_SHA'):manifest['deployment_commit']=os.environ['GITHUB_SHA']
    (destination/'site-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'files':len(public_files),'assets':manifest['assets'],'views':manifest['unique_views'],'price_cutoff':manifest['price_cutoff']},ensure_ascii=False))
    return manifest

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    prepare(root,root/'_site')
