
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const uang = n =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n || 0);

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [tab, setTab] = useState("kasir");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [message, setMessage] = useState("");

  const owner = profile?.role === "owner";
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty, 0
  );

  useEffect(() => {
    db.auth.getSession().then(({ data }) =>
      setSession(data.session)
    );

    const { data } = db.auth.onAuthStateChange(
      (_, session) => setSession(session)
    );

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProfile();
    else {
      setProfile(null);
      setProducts([]);
    }
  }, [session]);

  useEffect(() => {
    if (profile) {
      loadProducts();
      loadSales();
    }
  }, [profile]);

  async function loadProfile() {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (error) setMessage(error.message);
    else setProfile(data);
  }

  async function loadProducts() {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("name");

    if (error) setMessage(error.message);
    else setProducts(data || []);
  }

  async function loadSales() {
    const { data } = await db
      .from("sales")
      .select("*, sale_items(*)")
      .order("created_at", { ascending: false });

    setSales(data || []);
  }

  async function login() {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    setMessage(error ? error.message : "Berhasil masuk!");
  }

  async function register() {
    const { error } = await db.auth.signUp({
      email,
      password
    });

    setMessage(error ? error.message : "Akun berhasil dibuat. Silakan konfirmasi email jika diminta.");
  }

  function addCart(product) {
    if (product.stock <= 0) {
      setMessage("Stok habis!");
      return;
    }

    setCart(old => {
      const found = old.find(x => x.id === product.id);

      if (found) {
        if (found.qty >= product.stock) return old;

        return old.map(x =>
          x.id === product.id
            ? { ...x, qty: x.qty + 1 }
            : x
        );
      }

      return [...old, { ...product, qty: 1 }];
    });
  }

  function changeQty(id, qty) {
    const product = products.find(x => x.id === id);

    setCart(old =>
      qty <= 0
        ? old.filter(x => x.id !== id)
        : old.map(x =>
            x.id === id
              ? { ...x, qty: Math.min(qty, product.stock) }
              : x
          )
    );
  }

  async function checkout() {
    if (!cart.length) return;

    try {
      const { data: sale, error } = await db
        .from("sales")
        .insert({
          cashier_id: session.user.id,
          total,
          status: "paid"
        })
        .select()
        .single();

      if (error) throw error;

      const items = cart.map(x => ({
        sale_id: sale.id,
        product_id: x.id,
        product_name: x.name,
        qty: x.qty,
        price: x.price,
        subtotal: x.qty * x.price
      }));

      const { error: itemError } = await db
        .from("sale_items")
        .insert(items);

      if (itemError) throw itemError;

      for (const item of cart) {
        const { error } = await db
          .from("products")
          .update({ stock: item.stock - item.qty })
          .eq("id", item.id);

        if (error) throw error;
      }

      setCart([]);
      await loadProducts();
      await loadSales();
      setMessage("Transaksi berhasil!");
    } catch (error) {
      setMessage("Transaksi gagal: " + error.message);
    }
  }

  async function addProduct(e) {
    e.preventDefault();

    const { error } = await db.from("products").insert({
      name,
      price: Number(price),
      stock: Number(stock)
    });

    if (error) setMessage(error.message);
    else {
      setName("");
      setPrice("");
      setStock("");
      loadProducts();
      setMessage("Produk berhasil ditambahkan!");
    }
  }

  async function deleteProduct(id) {
    if (!confirm("Hapus produk ini?")) return;

    const { error } = await db
      .from("products")
      .delete()
      .eq("id", id);

    setMessage(error ? error.message : "Produk dihapus");
    loadProducts();
  }

  if (!session) {
    return (
      <main className="login">
        <h1>🥢 BASRENG LEUKOH</h1>
        <p>POINT OF SALE</p>

        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button onClick={login}>MASUK</button>
        <button onClick={register}>DAFTAR AKUN</button>
        <p>{message}</p>
      </main>
    );
  }

  if (!profile) return <h2>Memuat akun...</h2>;

  return (
    <main className="app">
      <header>
        <h1>🥢 BASRENG LEUKOH POS</h1>
        <p>{owner ? "BOS" : "KASIR"}</p>
        <button onClick={() => db.auth.signOut()}>
          KELUAR
        </button>
      </header>

      <nav>
        <button onClick={() => setTab("kasir")}>KASIR</button>
        <button onClick={() => setTab("riwayat")}>RIWAYAT</button>
        {owner && (
          <button onClick={() => setTab("produk")}>
            PRODUK
          </button>
        )}
      </nav>

      <p className="message">{message}</p>

      {tab === "kasir" && (
        <div className="layout">
          <section>
            <h2>Daftar Produk</h2>
            <div className="products">
              {products.map(p => (
                <button
                  className="product"
                  key={p.id}
                  disabled={p.stock <= 0}
                  onClick={() => addCart(p)}
                >
                  <b>{p.name}</b>
                  <strong>{uang(p.price)}</strong>
                  <small>Stok: {p.stock}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="cart">
            <h2>Keranjang</h2>

            {cart.map(x => (
              <div className="line" key={x.id}>
                <span>
                  {x.name}
                  <br />
                  {uang(x.price)}
                </span>

                <button onClick={() =>
                  changeQty(x.id, x.qty - 1)
                }>−</button>

                {x.qty}

                <button onClick={() =>
                  changeQty(x.id, x.qty + 1)
                }>+</button>
              </div>
            ))}

            <h2>Total: {uang(total)}</h2>
            <button onClick={checkout}>
              BAYAR SEKARANG
            </button>
          </section>
        </div>
      )}

      {tab === "produk" && owner && (
        <section>
          <h2>Tambah Produk</h2>

          <form onSubmit={addProduct}>
            <input
              placeholder="Nama produk"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />

            <input
              type="number"
              placeholder="Harga"
              value={price}
              onChange={e => setPrice(e.target.value)}
              required
            />

            <input
              type="number"
              placeholder="Stok"
              value={stock}
              onChange={e => setStock(e.target.value)}
              required
            />

            <button>TAMBAH PRODUK</button>
          </form>

          {products.map(p => (
            <div className="line" key={p.id}>
              {p.name} — {uang(p.price)} — Stok {p.stock}
              <button onClick={() => deleteProduct(p.id)}>
                HAPUS
              </button>
            </div>
          ))}
        </section>
      )}

      {tab === "riwayat" && (
        <section>
          <h2>Riwayat Transaksi</h2>

          {sales.map(s => (
            <div className="line" key={s.id}>
              <span>
                {new Date(s.created_at).toLocaleString("id-ID")}
                <br />
                {s.sale_items?.map(i =>
                  `${i.product_name} x${i.qty}`
                ).join(", ")}
              </span>
              <b>{uang(s.total)}</b>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
       
