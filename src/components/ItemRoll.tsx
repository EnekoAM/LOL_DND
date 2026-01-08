import React, { useState } from 'react';
import ItemsData from '../json/item_roll.json';
import Items from '../json/items_actualizados.json';

type Item = {
  name: string;
  coste: number;
  normalizado: number;
  "Probabilidad(0,1)": number;
  "Probabilidad(acumulada)": number;
};

const rollFromTable = (items: Item[]): Item => {
  const roll = Math.random();
  for (let i = items.length - 1; i >= 0; i--) {
    if (roll >= items[i]["Probabilidad(acumulada)"]) {
      return items[i];
    }
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

const rarityColors: Record<string, string> = {
  basico: "#9ca3af",
  epico: "#a855f7",
  legendario: "#f59e0b"
};

const buttonBase = {
  padding: "0.9rem 1.2rem",
  borderRadius: "999px",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
  background: "#1e293b",
  color: "#e5e7eb",
  transition: "transform 0.1s ease, box-shadow 0.1s ease"
};

const ItemRoll = () => {
  const [result, setResult] = useState<Item | null>(null);
  const [rarity, setRarity] = useState<string>("");
  const [spawnResult, setSpawnResult] = useState<string>("");
  const [rolling, setRolling] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");

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
        if (rarityResult.includes("epico")) finalType = "epico";
        if (rarityResult.includes("legendario")) finalType = "legendario";
      }

      const item = rollFromTable(ItemsData.items[finalType]);
      setResult(item);
      setRarity(finalType);

      // Buscar la imagen en items_actualizados.json
      const itemUpdated = Items.find(
        i => i.nombre.toLowerCase() === item.name.toLowerCase()
      );
        
      console.log("Item obtenido:", item);
      console.log("Item actualizado:", itemUpdated);

      if (itemUpdated?.imagen) {
        setImageUrl(itemUpdated.imagen);
      }

      setRolling(false);
    }, 700);
  };

  const rollSpawn = (type: "Basico" | "Epico") => {
    const prob = ItemsData.rolls.find(r => r.type === type)?.prob ?? 0;
    const success = rollChance(prob);
    setSpawnResult(
      success
        ? `✅ Aparece item ${type.toLowerCase()}`
        : `❌ No aparece item ${type.toLowerCase()}`
    );
  };

  return (
    <div
      style={{
        padding: "2rem",
        background: "#020617",
        maxWidth: "520px",
        margin: "2rem auto",
        borderRadius: "20px",
        textAlign: "center",
        color: "#e5e7eb"
      }}
    >
      <h2 style={{ fontSize: "1.8rem", marginBottom: "1rem" }}>🎲 Item Roll</h2>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button
          style={{
            ...buttonBase,
            borderColor: rarityColors.legendario,
            boxShadow: "0 6px 0 #0f172a"
          }}
          onClick={() => rollSpawn("Basico")}
        >
          ¿Item básico? (50%)
        </button>

        <button
          style={{
            ...buttonBase,
            borderColor: rarityColors.legendario,
            boxShadow: "0 6px 0 #0f172a"
          }}
          onClick={() => rollSpawn("Epico")}
        >
          ¿Item épico? (75%)
        </button>

        <button
          style={{
            ...buttonBase,
            borderColor: rarityColors.legendario,
            boxShadow: "0 6px 0 #0f172a"
          }}
          onClick={() => rollItem("basico")}
          onMouseDown={e => (e.currentTarget.style.transform = "translateY(4px)")}
          onMouseUp={e => (e.currentTarget.style.transform = "translateY(0)")}
        >
          Roll Básico
        </button>

        <button
          style={{
            ...buttonBase,
            borderColor: rarityColors.legendario,
            boxShadow: "0 6px 0 #0f172a"
          }}
          onClick={() => rollItem("epico")}
          onMouseDown={e => (e.currentTarget.style.transform = "translateY(4px)")}
          onMouseUp={e => (e.currentTarget.style.transform = "translateY(0)")}
        >
          Roll Épico
        </button>

        <button
          style={{
            ...buttonBase,
            borderColor: rarityColors.legendario,
            boxShadow: "0 6px 0 #0f172a"
          }}
          onClick={() => rollItem("legendario")}
          onMouseDown={e => (e.currentTarget.style.transform = "translateY(4px)")}
          onMouseUp={e => (e.currentTarget.style.transform = "translateY(0)")}
        >
          Roll Legendario
        </button>
      </div>

      {spawnResult && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            background: "#020617",
            borderRadius: "8px",
            border: "1px solid #334155",
            fontWeight: 600
          }}
        >
          {spawnResult}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <div style={{ fontSize: "0.9rem", opacity: 0.6 }}>HAS OBTENIDO</div>
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              color: rarityColors[rarity],
              marginTop: "0.5rem"
            }}
          >
            {result.name}
          </div>
          {imageUrl && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
              <img
                src={imageUrl}
                alt={result.name}
                style={{ maxWidth: "200px", borderRadius: "12px" }}
              />
            </div>
          )}

        </div>
      )}

      {rolling && (
        <div style={{ marginTop: "1.5rem", fontSize: "1.2rem" }}>🎲 Rodando...</div>
      )}
    </div>
  );
};

export default ItemRoll;
