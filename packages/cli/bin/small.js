#!/usr/bin/env node
'use strict';
// Deprecation shim: `small` is now `rabbit-hole`, same code and arguments. The notice
// goes to stderr so scripts parsing stdout keep working. Retirement point:
// docs/features/rabbit-hole-cli-production-infra.md (Legacy retirement).
console.error('⚠ small is now rabbit-hole; npm i -g @rabbit-hole/cli');
require('./rabbit-hole.js');
