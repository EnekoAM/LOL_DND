import React, { useState } from 'react';
import './itemRoll.css';
import ItemsData from '../json/item_roll.json';
import Items from '../json/items_actualizados.json';
import MedievalWheel from './MedievalWheel';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Item = {
  name: string;
  coste: number;
  normalizado: number;
  "Probabilidad(0,1)": number;
  "Probabilidad(acumulada)": number;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const rollFromTable = (items: Item[]): Item => {
  const roll = Math.random();
  for (let i = items.length - 1; i >= 0; i--) {
    if (roll >= items[i]["Probabilidad(acumulada)"]) return items[i];
  }
  return items[0];
};

const rollRarity = (dropTable: { item: string; prob: number }[]) => {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const d of dropTable) {
    acc += d.prob;
    if (roll <= acc) return d.item;
  }
  return dropTable[0].item;
};

const rollChance = (prob: number) => Math.random() * 100 < prob;

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const rarityColors: Record<string, string> = {
  basico:     "#a09070",   // piedra desgastada
  epico:      "#8898e8",   // zafiro arcano
  legendario: "#c9a84c",   // oro antiguo
};

const rarityGlow: Record<string, string> = {
  basico:     "0 0 12px rgba(150,120,80,0.4),  0 0 36px rgba(150,120,80,0.12)",
  epico:      "0 0 16px rgba(100,120,220,0.55), 0 0 48px rgba(80,100,200,0.2)",
  legendario: "0 0 20px rgba(201,168,76,0.75),  0 0 60px rgba(201,168,76,0.28)",
};

const rarityBadge: Record<string, string> = {
  basico:     "COMÚN",
  epico:      "ÉPICO",
  legendario: "LEGENDARIO",
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const ItemRoll = () => {
  const [result, setResult]           = useState<Item | null>(null);
  const [rarity, setRarity]           = useState<string>("basico");
  const [spawnResult, setSpawnResult] = useState<string>("");
  const [rolling, setRolling]         = useState(false);
  const [imageUrl, setImageUrl]       = useState<string>("");
  const [mustSpin, setMustSpin]       = useState(false);
  const [rollingType, setRollingType] = useState("básico");

  // ── unchanged logic ──────────────────────────────────────────────────────
  const rollItem = (baseType: "basico" | "epico" | "legendario") => {
    setRolling(true);
    setResult(null);
    setImageUrl("");
    setTimeout(() => {
      let finalType = baseType;
      if (baseType !== "legendario") {
        const table =
          baseType === "basico"
            ? ItemsData["Drop basico"]
            : ItemsData["Drop epico"];
        const rarityResult = rollRarity(table);
        if (rarityResult.includes("epico"))      finalType = "epico";
        if (rarityResult.includes("legendario")) finalType = "legendario";
      }
      const item = rollFromTable(ItemsData.items[finalType]);
      setResult(item);
      setRarity(finalType);
      const itemUpdated = Items.find(
        i => i.nombre.toLowerCase() === item.name.toLowerCase()
      );
      if (itemUpdated?.imagen) setImageUrl(itemUpdated.imagen);
      setRolling(false);
    }, 500);
  };

  // ── Segmentos medievales para la rueda custom ────────────────────────────
  type WheelSegment = {
    label: string;
    color: string;
    textColor: string;
    borderColor: string;
  };

  const buildSegments = (prob: number): WheelSegment[] => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const pct     = Math.round(prob);
    const notPct  = 100 - pct;
    const divisor = gcd(pct, notPct);
    const scale   = Math.ceil((pct / divisor + notPct / divisor) / 20);
    const yes     = Math.round((pct / divisor) / scale);
    const no      = Math.round((notPct / divisor) / scale);

    const segs: WheelSegment[] = [];
    for (let i = 0; i < yes; i++)
      segs.push({ label: "✅ Sí", color: "#0d2010", textColor: "#7ec85a", borderColor: "#3a6b28" });
    for (let i = 0; i < no; i++)
      segs.push({ label: "✗ No", color: "#200a0a", textColor: "#c07060", borderColor: "#6b2a20" });

    // Alternar para distribución visual uniforme
    const mixed: WheelSegment[] = [];
    let yi = 0, ni = 0;
    const total = yes + no;
    for (let i = 0; i < total; i++) {
      if (yi < yes && (ni >= no || yi / total <= yes / total)) mixed.push(segs[yi++]);
      else mixed.push(segs[yes + ni++]);
    }
    return mixed;
  };

  const [wheelSegments, setWheelSegments] = useState<WheelSegment[]>(() => buildSegments(50));
  const [spinTarget,    setSpinTarget]    = useState<number | null>(null);

  const rollSpawnWheel = (type: "Basico" | "Epico") => {
    if (mustSpin) return;
    const prob     = ItemsData.rolls.find(r => r.type === type)?.prob ?? 50;
    const segs     = buildSegments(prob);
    const success  = rollChance(prob);

    const winIdxs  = segs.map((s, i) => s.label === "✅ Sí" ? i : -1).filter(i => i !== -1);
    const loseIdxs = segs.map((s, i) => s.label === "✗ No"  ? i : -1).filter(i => i !== -1);
    const pool     = success ? winIdxs : loseIdxs;
    const target   = pool[Math.floor(Math.random() * pool.length)];

    setWheelSegments(segs);
    setSpinTarget(target);
    setSpawnResult("");
    setRollingType(type.toLowerCase());
    setMustSpin(true);
  };

  const handleWheelResult = (seg: WheelSegment) => {
    setMustSpin(false);
    setSpinTarget(null);
    setSpawnResult(
      seg.label === "✅ Sí"
        ? `✦ El ítem ${rollingType} hace su aparición`
        : `✗ El ítem ${rollingType} no se manifiesta`
    );
  };
  // ────────────────────────────────────────────────────────────────────────

  const rc = rarityColors[rarity] ?? "#9ca3af";
  const rg = rarityGlow[rarity]   ?? "";

  return (
    <>
<div
        className="irs-wrap"
        style={{
          background: "linear-gradient(160deg, #1a1208 0%, #110d06 100%)",
          border: "1px solid rgba(150,120,70,0.3)",
          borderRadius: "6px",
          boxShadow: "0 0 0 1px rgba(100,80,40,0.08), 0 30px 70px rgba(0,0,0,0.85), inset 0 0 60px rgba(0,0,0,0.3)",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <div className="irs-inner">

          {/* HEADER */}
          <div className="irs-header">
            <div className="irs-title">Tabla de Botín</div>
          </div>

          <div className="irs-rule">
            <span className="irs-rule-ornament">⚜</span>
          </div>

          <div className="irs-layout">

            {/* ──────── LEFT PANEL ──────── */}
            <div className="irs-panel">


              <button className="irs-btn irs-btn--spawn-basic" onClick={() => rollSpawnWheel("Basico")}>
                <span className="irs-btn-icon">🎁</span>
                <span className="irs-btn-label">Spawn Básico</span>
                <span className="irs-btn-badge">50 %</span>
              </button>

              <button className="irs-btn irs-btn--spawn-epic" onClick={() => rollSpawnWheel("Epico")}>
                <span className="irs-btn-icon">✨</span>
                <span className="irs-btn-label">Spawn Épico</span>
                <span className="irs-btn-badge">75 %</span>
              </button>

              <div className="irs-sep" />

              <button className="irs-btn irs-btn--basic" onClick={() => rollItem("basico")} disabled={rolling}>
                <span className="irs-btn-icon">○</span>
                <span className="irs-btn-label">Roll Básico</span>
              </button>

              <button className="irs-btn irs-btn--epic" onClick={() => rollItem("epico")} disabled={rolling}>
                <span className="irs-btn-icon">◈</span>
                <span className="irs-btn-label">Roll Épico</span>
              </button>

              <button className="irs-btn irs-btn--legendary" onClick={() => rollItem("legendario")} disabled={rolling}>
                <span className="irs-btn-icon">🔥</span>
                <span className="irs-btn-label">Roll Legendario</span>
              </button>

              {/* SPAWN RESULT */}
              {spawnResult && (
                <div className={`irs-spawn-result ${spawnResult.includes("✦") ? "irs-spawn-result--ok" : "irs-spawn-result--fail"}`}>
                  {spawnResult}
                </div>
              )}

              {/* ITEM RESULT BOX — fixed height */}
              <div className="irs-item-box">
                <div
                  className="irs-item-box__glow"
                  style={{
                    background: result
                      ? `radial-gradient(ellipse at 50% 0%, ${rc}18, transparent 65%)`
                      : "none"
                  }}
                />

                {result ? (
                  <div className="irs-item-inner">
                    <div className="irs-item-obtained">— has obtenido —</div>
                    <div className="irs-item-rarity-tag" style={{ color: rc }}>
                      [ {rarityBadge[rarity] ?? rarity.toUpperCase()} ]
                    </div>
                    <div
                      className="irs-item-name"
                      style={{ color: rc, textShadow: rg }}
                    >
                      {result.name}
                    </div>
                    {imageUrl && (
                      <img
                        className="irs-item-img"
                        src={imageUrl}
                        alt={result.name}
                        style={{ boxShadow: rg }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="irs-item-empty">
                    {rolling ? "Consultando el oráculo..." : "— Ningún ítem revelado —"}
                  </div>
                )}
              </div>
            </div>

            {/* ──────── WHEEL PANEL ──────── */}
            <div className="irs-wheel-panel">
              <MedievalWheel
                segments={wheelSegments}
                spinTo={spinTarget}
                onResult={handleWheelResult}
              />
            </div>
          </div>
          </div>
        </div>
    </>
  );
};

export default ItemRoll;