import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const port=19000+Math.floor(Math.random()*3000),dir=mkdtempSync(path.join(os.tmpdir(),'buscadr-test-')),dbfile=path.join(dir,'test.sqlite');
let proc;
const url=`http://127.0.0.1:${port}`;
async function request(p,method='GET',body,headers={}){const r=await fetch(url+p,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});let cookie=r.headers.get('set-cookie');return {status:r.status,data:await r.json(),cookie:cookie?.match(/bd_session=[a-f0-9]{64}/)?.[0]}}
async function waitReady(){for(let i=0;i<60;i++){try{const r=await request('/api/v1/health');if(r.status===200)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('API did not start')}
test('local API: registration, role limits, unique booking slot and reviews',async t=>{
 proc=spawn(process.execPath,['--experimental-sqlite','server/server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DEMO_API:'1',DB_FILE:dbfile},stdio:'ignore'});
 t.after(()=>{proc?.kill();rmSync(dir,{recursive:true,force:true})});await waitReady();
 const patient=await request('/api/v1/auth/register','POST',{name:'Test Patient',email:'patient@demo.test',role:'patient',password:'DemoPatientPassword12!'});assert.equal(patient.status,201);
 const pro=await request('/api/v1/auth/register','POST',{name:'Test Professional',email:'professional@demo.test',role:'pro',specialty:'Pediatría',password:'DemoProfessionalPassword12!'});assert.equal(pro.status,201);
 const patientLogin=await request('/api/v1/auth/login','POST',{email:'patient@demo.test',password:'DemoPatientPassword12!'});assert.equal(patientLogin.status,200);
 const proLogin=await request('/api/v1/auth/login','POST',{email:'professional@demo.test',password:'DemoProfessionalPassword12!'});assert.equal(proLogin.status,200);
 const db=new DatabaseSync(dbfile);const doc=db.prepare('SELECT id FROM professionals').get();assert.ok(doc.id);
 const before=await request('/api/v1/appointments','POST',{professionalId:doc.id,date:'2027-01-30',time:'09:00'},{Cookie:patientLogin.cookie});assert.equal(before.status,404,'unverified doctors cannot accept bookings');
 db.prepare("UPDATE professionals SET status='verified' WHERE id=?").run(doc.id);
 const body={professionalId:doc.id,date:'2027-01-30',time:'09:00'};
 const attempted=await Promise.all(Array.from({length:16},()=>request('/api/v1/appointments','POST',body,{Cookie:patientLogin.cookie})));
 assert.equal(attempted.filter(x=>x.status===201).length,1,'exactly one concurrent booking');assert.equal(attempted.filter(x=>x.status===409).length,15);
 const appointmentId=attempted.find(x=>x.status===201).data.data.id;
 const wrongRole=await request(`/api/v1/appointments/${appointmentId}/confirm`,'POST',{}, {Cookie:patientLogin.cookie});assert.equal(wrongRole.status,403);
 const confirmed=await request(`/api/v1/appointments/${appointmentId}/confirm`,'POST',{}, {Cookie:proLogin.cookie});assert.equal(confirmed.status,200);
 const completed=await request(`/api/v1/appointments/${appointmentId}/complete`,'POST',{}, {Cookie:proLogin.cookie});assert.equal(completed.status,200);
 const review=await request('/api/v1/reviews','POST',{appointmentId,rating:5,body:'Excellent sample appointment experience.'},{Cookie:patientLogin.cookie});assert.equal(review.status,201);
 const duplicate=await request('/api/v1/reviews','POST',{appointmentId,rating:5,body:'Another example review.'},{Cookie:patientLogin.cookie});assert.equal(duplicate.status,409);
 const me=await request('/api/v1/auth/me','GET',null,{Cookie:patientLogin.cookie});assert.equal(me.data.data.role,'patient');
 db.close();
});