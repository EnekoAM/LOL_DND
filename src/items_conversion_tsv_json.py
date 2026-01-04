import json
import csv

# Archivos
TSV_FILE = "items_drive.tsv"
JSON_FILE = "items.json"
OUTPUT_FILE = "items_actualizados.json"

# Mapeo TSV → JSON
STAT_MAPPING = {
    "HP": "HP",
    "AC": "AC",
    "MR": "MR",
    "MANA": "MANA",
    "AD": "AD",
    "AP": "AP",
    "PROB. CRÍT.": "CRIT_CHANCE",
    "DAÑO CRÍT.": "CRIT_DAMAGE",
    "SPE": "SPE",
    "ATK_SPE_%": "ATK_SPE_PCT",
    "AB_SPE_%": "AB_SPE_PCT",
    "LETALIDAD": "LETHALITY",
    "PEN. MÁG.": "MAGIC_PEN"
}

# 1️⃣ Leer TSV y guardarlo en un diccionario por nombre (lower)
tsv_items = {}

with open(TSV_FILE, encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        item_name = row["ITEMS"].strip().lower()
        tsv_items[item_name] = row

# 2️⃣ Leer JSON
with open(JSON_FILE, encoding="utf-8") as f:
    json_items = json.load(f)

# 3️⃣ Actualizar JSON con datos del TSV
for item in json_items:
    nombre = item.get("nombre", "").strip().lower()

    if nombre in tsv_items:
        tsv_row = tsv_items[nombre]

        # Stats
        for tsv_col, json_stat in STAT_MAPPING.items():
            value = tsv_row.get(tsv_col, 0)
            try:
                item["stats"][json_stat] = float(value)
            except ValueError:
                item["stats"][json_stat] = 0

        # Pasiva / Activa
        item["efecto"]["pasiva"] = tsv_row.get("PASIVA(S)", "").strip()
        item["efecto"]["activa"] = tsv_row.get("ACTIVA(S)", "").strip()

# 4️⃣ Guardar JSON actualizado
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(json_items, f, indent=2, ensure_ascii=False)

print("✅ JSON actualizado correctamente")
