import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Auth from "./Auth";
import { api } from "./api";
import { DEPARTMENTS } from "./departments";
import Icon from "./components/Icon";
import logo from "./assets/ethin-mark.png";
import Ring from "./components/Ring";

const CATEGORIES = ["Hardware", "Software", "Network", "Account Access", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const slug = (v) => String(v || "").toLowerCase().replace(/\s+/g, "-");
const emptyForm = { name: "", email: "", employeeId: "", department: "", title: "", category: "", priority: "", description: "" };

// Suggest a priority from the issue details as the employee types.
function determinePriority(title = "", description = "", category = "") {
  const text = `${title} ${description}`.toLowerCase();
  if (/system down|server down|full outage|security breach|data breach|ransomware|hacked|critical outage/.test(text)) return "Critical";
  if (
    /not working|won't start|wont start|cannot log.?in|can't log.?in|cannot access|can't access|urgent|email down|laptop.*(dead|not turn)|unable to access/.test(text)
  )
    return "High";
  if (
    /install|installation|error|slow|printer|password reset|update|crash|bug/.test(text) ||
    ["Network", "Hardware", "Software", "Account Access"].includes(category)
  )
    return "Medium";
  if (title.trim() || description.trim()) return "Low";
  return "";
}

// Profile photo is kept in this browser, per employee (the API has no photo field yet).
const photoKey = (id) => `it-support-user-photo-${id}`;
function readPhoto(id) {
  try {
    return localStorage.getItem(photoKey(id)) || "";
  } catch {
    return "";
  }
}
function writePhoto(id, dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(photoKey(id), dataUrl);
    else localStorage.removeItem(photoKey(id));
  } catch {
    // Storage unavailable: the photo lasts until the page is closed.
  }
}
// Centre-crop an image/video frame to a small square JPEG so it stays light.
function toSquareJpeg(source, width, height, mirror = false, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const side = Math.min(width, height);
  if (mirror) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

const VIEWS = {
  dashboard: ["Overview", null, "Here’s an overview of your IT support requests."],
  new: ["New request", "Raise a support ticket", "Describe your issue and the IT team will take it from here."],
  history: ["Ticket history", "My ticket history", "Follow your requests and the latest status updates."],
  profile: ["My profile", "My profile", "Your registered details and your own support tickets."],
};

function App({ user, onUserChange, onLogout }) {
  const baseForm = () => ({ ...emptyForm, name: user.name, email: user.email, employeeId: user.employeeId, department: user.department || "" });
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState(baseForm);
  const [attachment, setAttachment] = useState(null);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState(() => readPhoto(user.employeeId));
  const [assets, setAssets] = useState([]);
  const employee = {
    name: user.name,
    id: user.employeeId,
    company: user.company || "Employee",
    department: user.department || "Not set",
    initial: (user.name || "A").trim().charAt(0).toUpperCase() || "A",
    photo,
  };

  useEffect(() => {
    let live = true;
    const refresh = () =>
      api("/tickets")
        .then((data) => live && setTickets(data))
        .catch((e) => live && setMessage(e.message));
    // Assets assigned by the admin show up in My assets without a reload.
    const refreshAssets = () =>
      api("/assets/mine")
        .then((data) => live && setAssets(data))
        .catch(() => {});
    refresh();
    refreshAssets();
    const assetTimer = setInterval(refreshAssets, 5000);
    const timer = setInterval(refresh, 5000);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(assetTimer);
    };
  }, []);

  const visible = tickets.filter((t) =>
    [t.id, t.title, t.category, t.status].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())),
  );
  const used = tickets.length;
  const open = tickets.filter((t) => t.status !== "Resolved").length;
  const resolved = tickets.filter((t) => t.status === "Resolved").length;
  const inProgress = tickets.filter((t) => t.status === "In Progress").length;

  function change(e) {
    const { name, value } = e.target;
    setForm((previous) => {
      const next = { ...previous, [name]: value };
      if (["title", "description", "category"].includes(name)) next.priority = determinePriority(next.title, next.description, next.category);
      return next;
    });
  }
  async function submit(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    let file = null;
    if (attachment) {
      if (attachment.size > 1_500_000) {
        setMessage("Please upload a file smaller than 1.5 MB per attachment.");
        return;
      }
      file = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: attachment.name, type: attachment.type, dataUrl: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(attachment);
      });
    }
    setSubmitting(true);
    let ticket;
    try {
      const data = await api("/tickets", { method: "POST", body: JSON.stringify({ ...form, attachment: file }) });
      ticket = data.ticket;
      setTickets((previous) => [ticket, ...previous]);
    } catch (error) {
      setMessage(error.message);
      return;
    } finally {
      setSubmitting(false);
    }
    setForm(baseForm());
    setAttachment(null);
    formEl.reset();
    setMessage(`${ticket.id} submitted successfully.`);
    setView("history");
  }
  const go = (next) => {
    setView(next);
    if (next === "new" || next === "profile") setMessage("");
  };
  const navItem = (name, icon, label, badge) => (
    <button key={name} className={view === name ? "nav active" : "nav"} onClick={() => go(name)} aria-current={view === name ? "page" : undefined}>
      <Icon name={icon} /> {label}
      {badge !== undefined && <span className="nav-count">{badge}</span>}
    </button>
  );
  const [crumb, title, subtitle] = VIEWS[view];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="Ethin" />
          <div>
            <b>Ethin Support</b>
            <small>Employee Workspace</small>
          </div>
        </div>
        <div className="user-card">
          <span className="avatar">{employee.photo ? <img src={employee.photo} alt="" /> : employee.initial}</span>
          <div>
            <b>{employee.name}</b>
            <small>{employee.id} · {employee.department}</small>
          </div>
        </div>
        <p className="nav-label">Workspace</p>
        {navItem("dashboard", "home", "Dashboard")}
        {navItem("new", "plus", "Raise a ticket")}
        {navItem("history", "list", "Ticket history", used)}
        {navItem("profile", "user", "My profile")}
        <div className="side-note">
          <b>Need a hand?</b>
          <span>Raise a ticket and our IT team will get back to you.</span>
          <button className="btn btn-sm btn-ghost side-signout" onClick={onLogout}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Employee portal</span>
            <span className="sep">/</span>
            <b>{crumb}</b>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => go("new")}>
              <Icon name="plus" /> New ticket
            </button>
            <button className="btn btn-ghost" onClick={onLogout} title="Sign out">
              <Icon name="logout" /> <span>Sign out</span>
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-head">
            <div>
              <p className="eyebrow">Employee portal</p>
              <h1>{title || `Welcome, ${employee.name}`}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          {message && (
            <div className="notice" role="status">
              <span><Icon name="checkCircle" /> {message}</span>
              <button onClick={() => setMessage("")} aria-label="Dismiss">×</button>
            </div>
          )}

          {view === "new" ? (
            <section className="card">
              <div className="section-head">
                <div>
                  <h2>IT service ticket</h2>
                  <p>Tell us what you need help with.</p>
                </div>
                <span className="chip"><Icon name="clock" /> Typical response within one business day</span>
              </div>
              <form onSubmit={submit} className="card-pad">
                <div className="form-grid">
                  <label className="field">
                    Employee name
                    <input name="name" readOnly value={form.name} required />
                  </label>
                  <label className="field">
                    Work email
                    <input name="email" readOnly type="email" value={form.email} required />
                  </label>
                  <label className="field">
                    Employee ID
                    <input name="employeeId" readOnly value={form.employeeId} />
                  </label>
                  <label className="field">
                    Department
                    <input name="department" readOnly value={form.department} placeholder="Set your department in My profile" />
                  </label>
                  <label className="field full">
                    Issue title *
                    <input name="title" value={form.title} onChange={change} placeholder="What do you need help with?" maxLength={150} required />
                  </label>
                  <label className="field">
                    Category *
                    <select name="category" value={form.category} onChange={change} required>
                      <option value="">Select category</option>
                      {CATEGORIES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Priority *
                    <select name="priority" value={form.priority} onChange={change} required>
                      <option value="">Suggested automatically</option>
                      {PRIORITIES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <small>Suggested from your issue title, description and category. You can change it.</small>
                  </label>
                  <label className="field full">
                    Description *
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={change}
                      placeholder="Please provide details, any error messages and what you have tried…"
                      rows="5"
                      maxLength={10000}
                      required
                    />
                  </label>
                  <label className="field full">
                    <span>Attachment <span className="hint">(optional · image, PDF, DOC, TXT · max 1.5 MB)</span></span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.doc,.docx,.txt"
                      onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                    />
                    {attachment && (
                      <small className="attachment-link"><Icon name="paperclip" /> {attachment.name}</small>
                    )}
                  </label>
                </div>
                <div className="form-actions" style={{ marginTop: 20 }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Your request helps us provide better support.</span>
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit ticket"} {!submitting && <Icon name="arrowRight" />}
                  </button>
                </div>
              </form>
            </section>
          ) : view === "dashboard" ? (
            <>
              <section className="hero-row">
                <div className="hero">
                  <div className="hero-body">
                    <Ring value={used ? (resolved / used) * 100 : 0} label="Requests resolved" />
                    <div className="hero-text">
                      <p className="eyebrow"><Icon name="activity" /> Your support summary</p>
                      <h2>
                        {!used
                          ? "No requests yet — raise a ticket whenever you need help."
                          : open
                            ? `${open} request${open > 1 ? "s are" : " is"} with the IT team right now.`
                            : "All your requests are resolved — you’re all set."}
                      </h2>
                      <div className="hero-facts">
                        <div><span>Company</span><b>{employee.company}</b></div>
                        <div><span>Department</span><b>{employee.department}</b></div>
                        <div><span>Employee ID</span><b>{employee.id}</b></div>
                      </div>
                    </div>
                  </div>
                  <div className="hero-foot">
                    <span>Clear details and screenshots help IT resolve issues faster.</span>
                    <button className="btn btn-primary" onClick={() => go("new")}>Raise a ticket</button>
                  </div>
                </div>
                <div className="stats two">
                  <Stat title="Tickets raised" value={used} icon="list" />
                  <Stat title="Active tickets" value={open} total={used} icon="trend" tone="sky" />
                  <Stat title="In progress" value={inProgress} total={used} icon="clock" tone="amber" />
                  <Stat title="Resolved tickets" value={resolved} total={used} icon="checkCircle" tone="green" />
                </div>
              </section>
              <TicketList owner={user} tickets={visible.slice(0, 5)} search={search} setSearch={setSearch} title="Recent tickets" actionLabel="View all" onAction={() => go("history")} />
            </>
          ) : view === "profile" ? (
            <Profile
              user={user}
              employee={employee}
              stats={{ used, open, resolved, inProgress }}
              assets={assets}
              onSaved={(next) => {
                onUserChange(next);
                setForm((previous) => ({ ...previous, name: next.name, department: next.department || "" }));
                setMessage("Profile updated.");
              }}
              onError={setMessage}
              onPhoto={(dataUrl) => {
                writePhoto(user.employeeId, dataUrl);
                setPhoto(dataUrl);
                setMessage(dataUrl ? "Profile photo updated." : "Profile photo removed.");
              }}
            >
              <TicketList owner={user} tickets={visible} search={search} setSearch={setSearch} title="My tickets" actionLabel="Open history" onAction={() => go("history")} />
            </Profile>
          ) : (
            <TicketList owner={user} tickets={visible} search={search} setSearch={setSearch} title="All submitted tickets" actionLabel="Back to dashboard" onAction={() => go("dashboard")} />
          )}
        </div>
        <footer className="footer">
          <span>IT Support Portal</span>
          <span>Connected to IT Support · Updates refresh every 5 seconds</span>
        </footer>
      </main>
    </div>
  );
}

function Profile({ user, employee, stats, assets = [], onSaved, onError, onPhoto, children }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  // Once a department has been chosen it is fixed and cannot be changed.
  const departmentLocked = Boolean(user.department);
  async function save(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (departmentLocked) data.department = user.department;
    else if (!window.confirm(`Set your department to "${data.department}"? It is fixed once saved and cannot be changed later.`)) return;
    setBusy(true);
    try {
      const result = await api("/auth/profile", { method: "PATCH", body: JSON.stringify(data) });
      onSaved(result.user);
      setEditing(false);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <div className="profile-hero">
          <span className="avatar-edit">
            <span className="avatar lg">{employee.photo ? <img src={employee.photo} alt="Profile photo" /> : employee.initial}</span>
            <button type="button" className="avatar-camera" onClick={() => setPhotoOpen(true)} aria-label="Change profile photo" title="Take or upload a photo">
              <Icon name="camera" />
            </button>
          </span>
          <div>
            <h2>{employee.name}</h2>
            <p>{employee.id} · {user.email}</p>
          </div>
          <span className="chip">{user.role === "admin" ? "Administrator" : "Employee"}</span>
          {!editing && (
            <button type="button" className="icon-button" onClick={() => setEditing(true)} aria-label="Edit profile" title="Edit profile">
              <Icon name="pencil" />
            </button>
          )}
        </div>
        <div className="detail-grid">
          <div><small>Employee ID</small><b>{employee.id}</b></div>
          <div><small>Department</small><b>{employee.department}</b></div>
          <div><small>Member since</small><b>{user.joinedAt || "—"}</b></div>
        </div>
      </section>
      {editing && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Edit profile</h2>
              <p>Email, Employee ID and Department are fixed once set. You can update the rest.</p>
            </div>
          </div>
          <form onSubmit={save} className="card-pad" key={user.employeeId + user.department + user.name}>
            <div className="form-grid">
              <label className="field">
                Full name *
                <input name="name" defaultValue={user.name} maxLength={100} required />
              </label>
              <label className="field">
                Work email
                <input value={user.email} readOnly />
              </label>
              <label className="field">
                Employee ID
                <input value={employee.id} readOnly />
              </label>
              <label className="field">
                Department {!departmentLocked && "*"}
                {departmentLocked ? (
                  <input name="department" value={user.department} readOnly />
                ) : (
                  <select name="department" defaultValue="" required>
                    <option value="" disabled>Select your department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                )}
                <small>{departmentLocked ? "Your department is fixed and cannot be changed." : "Choose carefully — it is fixed once saved."}</small>
              </label>
              <label className="field">
                Company
                <input name="company" defaultValue={user.company || ""} maxLength={100} />
              </label>
              <label className="field">
                Account type
                <input value={user.role === "admin" ? "Administrator" : "Employee"} readOnly />
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
            </div>
          </form>
        </section>
      )}
      <section className="card">
        <div className="section-head">
          <div>
            <h2>My assets</h2>
            <p>Equipment your IT administrator has assigned to you.</p>
          </div>
          <span className="chip">{assets.length} {assets.length === 1 ? "asset" : "assets"}</span>
        </div>
        {assets.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Asset</th><th>Tag / serial</th><th>Category</th><th>Status</th><th>Assigned on</th></tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.name}</b></td>
                    <td className="mono">{a.asset_tag}</td>
                    <td>{a.category}</td>
                    <td><span className={"pill asset " + slug(a.status)}>{a.status}</span></td>
                    <td className="nowrap">{new Date(a.assigned_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon"><Icon name="laptop" /></span>
            <b>No assets assigned yet</b>
            <p>Assets your administrator assigns to you will appear here automatically.</p>
          </div>
        )}
      </section>
      <section className="stats">
        <Stat title="Tickets raised" value={stats.used} icon="list" />
        <Stat title="Active tickets" value={stats.open} total={stats.used} icon="trend" tone="sky" />
        <Stat title="In progress" value={stats.inProgress} total={stats.used} icon="clock" tone="amber" />
        <Stat title="Resolved tickets" value={stats.resolved} total={stats.used} icon="checkCircle" tone="green" />
      </section>
      {children}
      {photoOpen && (
        <PhotoDialog
          hasPhoto={Boolean(employee.photo)}
          onClose={() => setPhotoOpen(false)}
          onSave={(dataUrl) => {
            onPhoto(dataUrl);
            setPhotoOpen(false);
          }}
        />
      )}
    </>
  );
}

// Take a photo with the camera or upload one, preview it, then save.
function PhotoDialog({ hasPhoto, onClose, onSave }) {
  const [mode, setMode] = useState("choose"); // choose | camera | preview
  const [preview, setPreview] = useState("");
  const [problem, setProblem] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopCamera();
    };
  }, [onClose]);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem("Camera is not available in this browser. You can upload a photo instead.");
      setMode("choose");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((error) => {
        if (cancelled) return;
        setProblem(
          error.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser, or upload a photo instead."
            : "No camera was found. You can upload a photo instead.",
        );
        setMode("choose");
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPreview(toSquareJpeg(video, video.videoWidth, video.videoHeight, true));
    stopCamera();
    setMode("preview");
  }
  function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return setProblem("Please choose a PNG, JPG, GIF or WebP image.");
    if (file.size > 5_000_000) return setProblem("Please choose an image smaller than 5 MB.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPreview(toSquareJpeg(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
      setProblem("");
      setMode("preview");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem("That image could not be read. Try another file.");
    };
    img.src = url;
  }

  return createPortal(
    <div className="modal-backdrop center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass photo-dialog" role="dialog" aria-modal="true" aria-label="Profile photo">
        <button type="button" className="btn btn-ghost btn-sm close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        <p className="eyebrow">Profile photo</p>
        <h2>{mode === "camera" ? "Take a photo" : mode === "preview" ? "Looks good?" : "Update your photo"}</h2>
        {problem && <p className="photo-problem" role="alert"><Icon name="alert" /> {problem}</p>}

        {mode === "camera" && (
          <>
            <div className="photo-frame"><video ref={videoRef} autoPlay playsInline muted className="mirror" /></div>
            <div className="photo-actions">
              <button type="button" className="btn btn-primary" onClick={capture}><Icon name="camera" /> Capture</button>
              <button type="button" className="btn" onClick={() => setMode("choose")}>Cancel</button>
            </div>
          </>
        )}
        {mode === "preview" && (
          <>
            <div className="photo-frame round"><img src={preview} alt="New profile photo preview" /></div>
            <div className="photo-actions">
              <button type="button" className="btn btn-primary" onClick={() => onSave(preview)}>Use photo</button>
              <button type="button" className="btn" onClick={() => { setPreview(""); setMode("choose"); }}>Choose another</button>
            </div>
          </>
        )}
        {mode === "choose" && (
          <div className="photo-actions col">
            <button type="button" className="btn btn-primary" onClick={() => { setProblem(""); setMode("camera"); }}><Icon name="camera" /> Take a photo</button>
            <label className="btn">
              <Icon name="image" /> Upload a photo
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={upload} hidden />
            </label>
            {hasPhoto && <button type="button" className="btn btn-ghost" onClick={() => onSave("")}>Remove photo</button>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Stat({ title, value, icon, tone, total }) {
  const pct = total ? Math.round((value / total) * 100) : null;
  return (
    <div className="stat">
      <div className="stat-top">
        <p>{title}</p>
        <span className={"stat-icon " + (tone || "")}><Icon name={icon} /></span>
      </div>
      <div>
        <b>{value}</b>
        {pct !== null && (
          <div className="stat-bar" title={`${pct}% of your tickets`}><span style={{ width: pct + "%" }} /></div>
        )}
      </div>
    </div>
  );
}

// Read-only ticket details (same layout as the admin panel's ticket sheet).
function TicketDetails({ ticket, owner, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const t = ticket;
  const name = t.name || owner.name;
  const employeeId = t.employeeId || owner.employeeId;
  const email = t.email || owner.email;
  const isImage = t.attachment && (String(t.attachment.type || "").startsWith("image/") || String(t.attachment.dataUrl || "").startsWith("data:image/"));
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-label={`Ticket ${t.id} details`}>
        <button type="button" className="btn btn-ghost btn-sm close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        <p className="eyebrow">Ticket details · {t.id}</p>
        <h2>{t.title}</h2>
        <p className="muted">{[name, employeeId, email].filter(Boolean).join(" · ")}</p>
        <div className="detail-grid">
          <div><small>Category</small><b>{t.category || "—"}</b></div>
          <div><small>Priority</small><span className={"pill priority " + slug(t.priority)}>{t.priority}</span></div>
          <div><small>Status</small><span className={"pill status " + slug(t.status)}>{t.status}</span></div>
          <div><small>Submitted</small><b>{t.createdAt || "—"}</b></div>
          <div><small>Employee ID</small><b>{employeeId || "—"}</b></div>
          <div><small>Department</small><b>{t.department || owner.department || "—"}</b></div>
        </div>
        <h3>Description</h3>
        <p className="description">{t.description || "No description provided."}</p>
        {t.attachment && (
          <>
            <h3>Attachment</h3>
            {isImage && <img className="preview" src={t.attachment.dataUrl} alt={t.attachment.name || "Attachment"} />}
            <p>
              <a className="attachment-link" href={t.attachment.dataUrl} target="_blank" rel="noreferrer" download={t.attachment.name}>
                <Icon name="paperclip" /> {t.attachment.name}
              </a>
            </p>
          </>
        )}
        <h3>Update history</h3>
        <ul className="timeline">
          {(t.updates?.length ? t.updates : [`Ticket submitted · ${t.createdAt || ""}`]).map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function TicketList({ owner, tickets, search, setSearch, title, actionLabel, onAction }) {
  const [selected, setSelected] = useState(null);
  const closeDetails = () => setSelected(null);
  // Keep the open ticket in sync with the 5-second refresh.
  const openTicket = selected && (tickets.find((t) => t.id === selected.id) || selected);
  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>Keep track of your submitted requests.</p>
        </div>
        <button className="btn btn-sm" onClick={onAction}>
          {actionLabel} <Icon name="arrowRight" />
        </button>
      </div>
      <div className="controls">
        <div className="search">
          <Icon name="search" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ticket ID, issue, category or status" aria-label="Search tickets" />
        </div>
      </div>
      {tickets.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Issue</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Attachment</th>
                <th>IT updates</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="row-click" onClick={() => setSelected(t)}>
                  <td>
                    <button type="button" className="link-button ticket-id" onClick={() => setSelected(t)} aria-label={`View details of ${t.id}`}>{t.id}</button>
                  </td>
                  <td>
                    <b>{t.title}</b>
                    <small>{t.category}</small>
                  </td>
                  <td><span className={"pill priority " + slug(t.priority)}>{t.priority}</span></td>
                  <td><span className={"pill status " + slug(t.status)}>{t.status}</span></td>
                  <td className="nowrap">{t.createdAt}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {t.attachment ? (
                      <a className="attachment-link" href={t.attachment.dataUrl} target="_blank" rel="noreferrer" download={t.attachment.name}>
                        <Icon name="paperclip" /> {t.attachment.name}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <details>
                      <summary>{t.updates?.length || 0} updates</summary>
                      <ul>
                        {(t.updates || []).map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon"><Icon name="inbox" /></span>
          <b>No tickets found</b>
          <p>Submit a ticket or change your search.</p>
        </div>
      )}
      {openTicket && <TicketDetails ticket={openTicket} owner={owner} onClose={closeDetails} />}
    </section>
  );
}

export default function UserPortal() {
  return <Auth>{(user, setUser, logout) => <App user={user} onUserChange={setUser} onLogout={logout} />}</Auth>;
}
