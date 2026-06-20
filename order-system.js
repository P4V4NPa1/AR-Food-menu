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

  function normalizeOrder(order) {
    return {
      id: order.id || `CL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      customer_name: order.customer_name,
      phone: order.phone,
      notes: order.notes || '',
      order_type: order.order_type,
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
      const res = await fetch(tableUrl(), {
        method: 'POST',
        headers: orderHeaders(),
        body: JSON.stringify(normalized)
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json())[0];
    }
    const orders = localOrders();
    orders.unshift(normalized);
    saveLocalOrders(orders);
    return normalized;
  }

  async function listOrders() {
    if (hasSupabase()) {
      const res = await fetch(tableUrl('select=*&order=created_at.desc'), { headers: orderHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    }
    return localOrders().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function getOrder(id) {
    if (hasSupabase()) {
      const res = await fetch(tableUrl(`id=eq.${encodeURIComponent(id)}&select=*&limit=1`), { headers: orderHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json())[0] || null;
    }
    return localOrders().find(order => order.id === id) || null;
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

  async function listAvailability() {
    if (hasSupabase() && config.availabilityTable) {
      try {
        const res = await fetch(availabilityTableUrl('select=*'), { headers: orderHeaders() });
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()).reduce((map, item) => {
          map[item.item_name] = normalizeAvailability(item);
          return map;
        }, {});
      } catch (error) {
        console.warn('Using local menu availability fallback:', error);
      }
    }
    return localAvailability();
  }

  async function updateAvailability(itemName, patch) {
    const normalized = normalizeAvailability({ item_name: itemName, ...patch });
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
    availability[itemName] = normalized;
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
    listAvailability,
    updateAvailability,
    paymentLabel,
    statusLabel
  };
})();
