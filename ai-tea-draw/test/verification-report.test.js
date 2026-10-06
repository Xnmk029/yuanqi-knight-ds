'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSteamReport}=require('../scripts/verify');
test('Steam native diagnostics after JSON do not erase successful initialization evidence',()=>{
 const report={status:'passed',mode:'steam-single-endpoint',time:'2026-10-04T19:27:51.207Z',checks:['native-initialization','eight-seat-lobby']};
 assert.deepEqual(parseSteamReport({stdout:'Steam initialization diagnostic\r\n'+JSON.stringify(report)+'\nNative socket cleanup diagnostic\r\n',stderr:''}),report);
});
test('missing or unrelated Steam check output remains explicitly blocked',()=>{
 assert.equal(parseSteamReport({stdout:'{"status":"passed","mode":"mock"}\n',stderr:'native check failed'}).code,'STEAM_CHECK_UNAVAILABLE');
 const blocked={status:'blocked',mode:'steam-single-endpoint',code:'STEAM_ENVIRONMENT_UNAVAILABLE'};
 assert.deepEqual(parseSteamReport({stdout:JSON.stringify(blocked)+'\nNative diagnostic',stderr:''}),blocked);
});
