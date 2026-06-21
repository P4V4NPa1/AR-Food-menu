window.CurryOrderConfig = window.CurryOrderConfig || {
  supabaseUrl: 'https://bijmyyzlpsveitmvcmyh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpam15eXpscHN2ZWl0bXZjbXloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjYyMjgsImV4cCI6MjA5NzQ0MjIyOH0.0zy4USnKLTaBEyU0Vg9Y49Nes6qs9C75H6Os48n8q5c',
  ordersTable: 'orders',
  availabilityTable: 'menu_availability',
  staffPasscode: 'CL-STAFF-2026'
};

(function () {
  const config = window.CurryOrderConfig;
  const localKey = 'clOrders';
  const availabilityLocalKey = 'clMenuAvailability';
  const clearedAtKey = 'clOrdersClearedAt';
  const clearedAtMetaKey = '__orders_cleared_at';

  function hasSupabase() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.ordersTable);
  }

  function orderHeaders() {
    return {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
  }

  function tableUrl(query = '') {
    const base = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${config.ordersTable}`;
    return query ? `${base}?${query}` : base;
  }

  function availabilityTableUrl(query = '') {
    const table = config.availabilityTable || 'menu_availability';
    const base = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`;
    return query ? `${base}?${query}` : base;
  }

  function localOrders() {
    return JSON.parse(localStorage.getItem(localKey) || '[]');
  }

  function saveLocalOrders(orders) {
    localStorage.setItem(localKey, JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent('cl-orders-change'));
  }

  function localAvailability() {
    return JSON.parse(localStorage.getItem(availabilityLocalKey) || '{}');
  }

  function saveLocalAvailability(availability) {
    localStorage.setItem(availabilityLocalKey, JSON.stringify(availability));
    window.dispatchEvent(new CustomEvent('cl-availability-change'));
  }

  function normalizeAvailability(item) {
    return {
      item_name: item.item_name,
      status: item.status || 'available',
      note: item.note || '',
      available_at: item.available_at || '',
      updated_at: new Date().toISOString()
    };
  }

  function availabilityKey(itemName, branchId = '') {
    return branchId ? `${branchId}::${itemName}` : itemName;
  }

  function splitAvailabilityKey(key) {
    const parts = String(key || '').split('::');
    return parts.length > 1 ? { branchId: parts[0], itemName: parts.slice(1).join('::') } : { branchId: '', itemName: key };
  }

  async function remoteResetTime() {
    if (!hasSupabase() || !config.availabilityTable) return '';
    try {
      const res = await fetch(availabilityTableUrl(`item_name=eq.${encodeURIComponent(clearedAtMetaKey)}&select=*&limit=1`), { headers: orderHeaders() });
      if (!res.ok) return '';
      const row = (await res.json())[0];
      return row?.available_at || row?.note || '';
    } catch (error) {
      console.warn('Could not load shared reset timestamp:', error);
      return '';
    }
  }

  async function saveResetTime(value) {
    localStorage.setItem(clearedAtKey, value);
    if (!hasSupabase() || !config.availabilityTable) return;
    try {
      const marker = normalizeAvailability({ item_name: clearedAtMetaKey, status: 'meta', note: value, available_at: value });
      const res = await fetch(availabilityTableUrl('on_conflict=item_name'), {
        method: 'POST',
        headers: { ...orderHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(marker)
      });
      if (!res.ok) console.warn('Could not save shared reset timestamp:', await res.text());
    } catch (error) {
      console.warn('Could not save shared reset timestamp:', error);
    }
  }

  function normalizeOrder(order) {
    const branchLabel = order.branch_name ? `${order.branch_name}${order.branch_address ? `, ${order.branch_address}` : ''}` : '';
    const notes = order.notes || '';
    return {
      id: order.id || `CL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      customer_name: order.customer_name,
      phone: order.phone,
      notes,
      order_type: order.order_type,
      branch_id: order.branch_id || '',
      branch_name: order.branch_name || '',
      branch_address: order.branch_address || '',
      branch_phone: order.branch_phone || '',
      branch_label: branchLabel,
      payment_method: order.payment_method,
      payment_status: order.payment_status || (order.payment_method === 'cod' ? 'cash_on_delivery' : 'provider_setup_required'),
      items: order.items || [],
      total: Number(order.total || 0),
      status: order.status || 'sent',
      prep_minutes: order.prep_minutes || null,
      created_at: order.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async function createOrder(order) {
    const normalized = normalizeOrder(order);
    if (hasSupabase()) {
      let res = await fetch(tableUrl(), {
        method: 'POST',
        headers: orderHeaders(),
        body: JSON.stringify(normalized)
      });
      if (!res.ok) {
        const message = await res.text();
        if (/branch_|schema cache|column/i.test(message)) {
          const { branch_id, branch_name, branch_address, branch_phone, branch_label, ...legacyOrder } = normalized;
          legacyOrder.notes = [branch_label ? `Branch: ${branch_label}` : '', normalized.branch_phone ? `Branch phone: ${normalized.branch_phone}` : '', normalized.notes].filter(Boolean).join('\n');
          res = await fetch(tableUrl(), {
            method: 'POST',
            headers: orderHeaders(),
            body: JSON.stringify(legacyOrder)
          });
        } else {
          throw new Error(message);
        }
      }
      if (!res.ok) throw new Error(await res.text());
      return (await res.json())[0];
    }
    const orders = localOrders();
    orders.unshift(normalized);
    saveLocalOrders(orders);
    return normalized;
  }

  async function listOrders() {
    const clearedAt = await remoteResetTime() || localStorage.getItem(clearedAtKey);
    const visibleAfterReset = order => !clearedAt || new Date(order.created_at) > new Date(clearedAt);
    if (hasSupabase()) {
      const res = await fetch(tableUrl('select=*&order=created_at.desc'), { headers: orderHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).filter(visibleAfterReset);
    }
    return localOrders().filter(visibleAfterReset).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function getOrder(id) {
    const clearedAt = await remoteResetTime() || localStorage.getItem(clearedAtKey);
    const visibleAfterReset = order => !order || !clearedAt || new Date(order.created_at) > new Date(clearedAt);
    if (hasSupabase()) {
      const res = await fetch(tableUrl(`id=eq.${encodeURIComponent(id)}&select=*&limit=1`), { headers: orderHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const order = (await res.json())[0] || null;
      return visibleAfterReset(order) ? order : null;
    }
    const order = localOrders().find(order => order.id === id) || null;
    return visibleAfterReset(order) ? order : null;
  }

  async function updateOrder(id, patch) {
    const update = { ...patch, updated_at: new Date().toISOString() };
    if (hasSupabase()) {
      const res = await fetch(tableUrl(`id=eq.${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: orderHeaders(),
        body: JSON.stringify(update)
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json())[0];
    }
    const orders = localOrders();
    const idx = orders.findIndex(order => order.id === id);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...update };
    saveLocalOrders(orders);
    return orders[idx];
  }

  async function clearOrders() {
    const clearedAt = new Date().toISOString();
    await saveResetTime(clearedAt);
    localStorage.setItem(localKey, '[]');
    if (hasSupabase()) {
      try {
        const res = await fetch(tableUrl('id=not.is.null'), {
          method: 'DELETE',
          headers: orderHeaders()
        });
        if (!res.ok) console.warn('Supabase delete blocked, hiding old orders locally:', await res.text());
      } catch (error) {
        console.warn('Supabase delete failed, hiding old orders locally:', error);
      }
      window.dispatchEvent(new CustomEvent('cl-orders-change'));
      return true;
    }
    window.dispatchEvent(new CustomEvent('cl-orders-change'));
    return true;
  }

  async function listAvailability(branchId = '') {
    if (hasSupabase() && config.availabilityTable) {
      try {
        const res = await fetch(availabilityTableUrl('select=*'), { headers: orderHeaders() });
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()).reduce((map, item) => {
          if (item.item_name === clearedAtMetaKey) return map;
          const key = splitAvailabilityKey(item.item_name);
          if (key.branchId === branchId || (!key.branchId && !map[key.itemName])) {
            map[key.itemName] = normalizeAvailability({ ...item, item_name: key.itemName });
          }
          return map;
        }, {});
      } catch (error) {
        console.warn('Using local menu availability fallback:', error);
      }
    }
    const availability = localAvailability();
    return Object.keys(availability).reduce((map, keyName) => {
      const key = splitAvailabilityKey(keyName);
      if (key.branchId === branchId || (!key.branchId && !map[key.itemName])) {
        map[key.itemName] = normalizeAvailability({ ...availability[keyName], item_name: key.itemName });
      }
      return map;
    }, {});
  }

  async function updateAvailability(itemName, patch, branchId = '') {
    const storageKey = availabilityKey(itemName, branchId);
    const normalized = normalizeAvailability({ item_name: storageKey, ...patch });
    if (hasSupabase() && config.availabilityTable) {
      try {
        const res = await fetch(availabilityTableUrl('on_conflict=item_name'), {
          method: 'POST',
          headers: { ...orderHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(normalized)
        });
        if (!res.ok) throw new Error(await res.text());
        window.dispatchEvent(new CustomEvent('cl-availability-change'));
        return (await res.json())[0];
      } catch (error) {
        console.warn('Saving menu availability locally:', error);
      }
    }
    const availability = localAvailability();
    availability[storageKey] = normalized;
    saveLocalAvailability(availability);
    return normalized;
  }

  function paymentLabel(method) {
    return {
      cod: 'Cash on delivery / pay at restaurant',
      apple_pay: 'Apple Pay',
      google_pay: 'Google Pay',
      blik: 'BLIK'
    }[method] || method;
  }

  function statusLabel(order) {
    if (!order) return '';
    if (order.status === 'accepted' && order.prep_minutes) return `Accepted · ready in ${order.prep_minutes} min`;
    return {
      sent: 'Order sent',
      accepted: 'Accepted',
      preparing: order.prep_minutes ? `Preparing · ready in ${order.prep_minutes} min` : 'Preparing',
      ready: 'Ready',
      completed: 'Completed',
      rejected: 'Rejected'
    }[order.status] || order.status;
  }

  window.CurryOrders = {
    config,
    hasSupabase,
    createOrder,
    listOrders,
    getOrder,
    updateOrder,
    clearOrders,
    listAvailability,
    updateAvailability,
    paymentLabel,
    statusLabel
  };
})();
