'use strict';

const STORAGE = {
  SETTINGS: 'agf.caixaAvista.settings.v1',
  CLIENTS: 'agf.caixaAvista.clients.v1',
  ENTRIES: 'agf.caixaAvista.entries.v1',
  CLOSURES: 'agf.caixaAvista.closures.v1'
};

const PAYMENT_METHODS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito'];
const DEFAULT_SETTINGS = {
  apiUrl: '',
  pixKey: '',
  pixName: '',
  pixCity: 'FORTALEZA'
};

const state = {
  settings: loadJson(STORAGE.SETTINGS, DEFAULT_SETTINGS),
  clients: [],
  entries: [],
  summary: emptySummary(),
  selectedClient: null,
  paymentMethod: '',
  quantity: 1,
  amountCents: 0,
  expenseAmountCents: 0,
  movementFilter: 'all',
  currentView: 'sale',
  currentPixPayload: '',
  currentPixDraft: null,
  operationalClosure: null,
  busy: false
};

const el = {};
