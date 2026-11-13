import sys,subprocess,json,datetime
from pathlib import Path
p=Path(__file__).resolve().parent
name,cmd=sys.argv[1],sys.argv[2]
start=datetime.datetime.now().astimezone().isoformat()
with (p/(name+'.log')).open('w') as f:
 r=subprocess.run(cmd,shell=True,stdout=f,stderr=subprocess.STDOUT)
record=dict(command=cmd,exitCode=r.returncode,start=start,end=datetime.datetime.now().astimezone().isoformat())
(p/(name+'-result.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record));print((p/(name+'.log')).read_text()[-5000:]);sys.exit(r.returncode)
