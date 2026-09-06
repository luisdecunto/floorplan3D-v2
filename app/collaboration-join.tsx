import { useState } from "react";
import { cleanCollaboratorName, readIdentities } from "./collaborator-identity";

export function CollaborationJoin({ onJoin, onCancel }: { onJoin: (name: string) => void; onCancel: () => void }) {
  const [recent] = useState(() => { try { return readIdentities(localStorage); } catch { return []; } });
  const [name, setName] = useState(() => { try { return recent[0]?.name ?? localStorage.getItem("planform-collaborator-name") ?? ""; } catch { return ""; } });
  return <main className="ws-start"><form className="ws-start-card ws-join" onSubmit={(event) => { event.preventDefault(); if (cleanCollaboratorName(name)) onJoin(name); }}>
    <h1>Join shared apartment</h1><p>Choose the name your partner will see in the collaborator list and change history.</p>
    <label htmlFor="collaborator-name">Your name</label><input id="collaborator-name" autoComplete="given-name" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} />
    {recent.length > 0 && <div className="ws-recent-names"><p>Recent names on this device</p>{recent.map((item) => <button type="button" key={item.id} onClick={() => setName(item.name)}>{item.name}</button>)}</div>}
    <button className="ws-primary" disabled={!cleanCollaboratorName(name)}>Join apartment</button><button type="button" onClick={onCancel}>Cancel</button><small>Names are display labels, without accounts or passwords.</small>
  </form></main>;
}
