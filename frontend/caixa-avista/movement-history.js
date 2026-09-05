'use strict';

(() => {
  const previousFetch = window.fetch.bind(window);
  const TIMEZONE = 'America/Fortaleza';
  const TIMESTAMP_PATTERN = /\d{2}\/\d{2}\/\d{4}\s*·\s*\d{2}:\d{2}/;

  function formatMovementTimestamp(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);

    const values = {};

    parts.forEach(part => {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });

    if (
      !values.day ||
      !values.month ||
      !values.year ||
      values.hour == null ||
      values.minute == null
    ) {
      return '';
    }

    return (
      values.day +
      '/' +
      values.month +
      '/' +
      values.year +
      ' · ' +
      values.hour +
      ':' +
      values.minute
    );
  }

  function decorateEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const timestamp = formatMovementTimestamp(entry.createdAt);
    const mode = String(entry.mode || '').trim();

    if (!timestamp || TIMESTAMP_PATTERN.test(mode)) {
      return false;
    }

    entry.mode = [mode, timestamp]
      .filter(Boolean)
      .join(' · ');

    return true;
  }

  function decorateWithdrawal(withdrawal) {
    if (!withdrawal || typeof withdrawal !== 'object') {
      return false;
    }

    const timestamp = formatMovementTimestamp(withdrawal.createdAt);
    const operatorName = String(withdrawal.operatorName || '').trim();

    if (!timestamp || TIMESTAMP_PATTERN.test(operatorName)) {
      return false;
    }

    withdrawal.operatorName = [operatorName, timestamp]
      .filter(Boolean)
      .join(' · ');

    return true;
  }

  function decoratePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    let changed = false;

    if (Array.isArray(payload.entries)) {
      payload.entries.forEach(entry => {
        changed = decorateEntry(entry) || changed;
      });
    }

    if (payload.entry) {
      changed = decorateEntry(payload.entry) || changed;
    }

    if (Array.isArray(payload.withdrawals)) {
      payload.withdrawals.forEach(withdrawal => {
        changed = decorateWithdrawal(withdrawal) || changed;
      });
    }

    if (payload.withdrawal) {
      changed = decorateWithdrawal(payload.withdrawal) || changed;
    }

    return changed;
  }

  window.fetch = async function(input, init = {}) {
    const response = await previousFetch(input, init);

    try {
      const method = String(
        init?.method || input?.method || 'GET'
      ).toUpperCase();

      if (method !== 'POST' || !response.ok) {
        return response;
      }

      const clone = response.clone();
      const payload = await clone.json();

      if (!decoratePayload(payload)) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('content-type', 'application/json; charset=utf-8');

      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };

  window.CaixaMovementHistory = Object.freeze({
    formatMovementTimestamp
  });
})();
