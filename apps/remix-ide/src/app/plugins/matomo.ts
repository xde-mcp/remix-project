'use strict'
import { Plugin } from '@remixproject/engine'

const profile = {
  name: 'matomo',
  description: 'send analytics to Matomo',
  methods: ['track'],
  events: [''],
  version: '1.0.0'
}

const allowedPlugins = ['LearnEth', 'etherscan', 'vyper', 'circuit-compiler', 'doc-gen', 'doc-viewer', 'solhint', 'walletconnect', 'scriptRunner', 'scriptRunnerBridge', 'dgit', 'contract-verification', 'noir-compiler']

export class Matomo extends Plugin {
  _paq: { push: (data: string[]) => void }

  constructor(_paq: { push: (data: string[]) => void }) {
    super(profile)
    this._paq = _paq
  }

  async track(data: string[]) {
    if (!allowedPlugins.includes(this.currentRequest.from)) return
    this._paq.push(data)
  }

  push(data: string[]) {
    console.log('data coming through matomo plugin:', ...data)
    this._paq.push(data)
  }
}