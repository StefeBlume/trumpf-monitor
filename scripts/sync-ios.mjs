import {execFileSync} from 'node:child_process';import {copyFileSync} from 'node:fs';
execFileSync('npx',['cap','sync','ios'],{stdio:'inherit'});
copyFileSync('scripts/Package.local.swift','ios/App/CapApp-SPM/Package.swift');
