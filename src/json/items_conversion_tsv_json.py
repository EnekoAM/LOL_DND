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

STRING_STATS = {"AD", "AP"}  # Solo estos serán strings

# 1️⃣ Leer TSV y guardarlo en un diccionario por nombre (lowercase)
tsv_items = {}
with open(TSV_FILE, encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        item_name = row["ITEMS"].strip().lower()
        tsv_items[item_name] = row

# 2️⃣ Leer JSON (lista de items)
with open(JSON_FILE, encoding="utf-8") as f:
    json_items = json.load(f)

# 3️⃣ Fusionar TSV con JSON
for item in json_items:
    nombre = item.get("nombre", "").strip().lower()
    if not nombre or nombre not in tsv_items:
        continue

    tsv_row = tsv_items[nombre]

    # Asegurarse de que existan las claves
    item.setdefault("stats", {})
    item.setdefault("efecto", {})

    # Fusionar stats
    for tsv_col, json_stat in STAT_MAPPING.items():
        raw = tsv_row.get(tsv_col, "").strip()
        if not raw:
            continue

        # Reemplazar coma por punto para decimales
        raw_num = raw.replace(",", ".")

        if json_stat in STRING_STATS:
            # AD y AP: 0 → número, otro → string
            try:
                val = float(raw_num)
                item["stats"][json_stat] = 0 if val == 0 else raw
            except ValueError:
                item["stats"][json_stat] = raw
        else:
            # Stats numéricas
            try:
                val = float(raw_num)
                item["stats"][json_stat] = int(val) if val.is_integer() else val
            except ValueError:
                item["stats"][json_stat] = 0

    # Fusionar pasiva/activa
    pasiva = tsv_row.get("PASIVA(S)", "").strip()
    activa = tsv_row.get("ACTIVA(S)", "").strip()

    # Guardar "-" si viene "-", "" si está vacío, sino el valor
    item["efecto"]["pasiva"] = "-" if pasiva == "-" else pasiva
    item["efecto"]["activa"] = "-" if activa == "-" else activa

# 4️⃣ Guardar JSON fusionado
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(json_items, f, indent=2, ensure_ascii=False)

print(f"✅ JSON fusionado guardado en '{OUTPUT_FILE}'")
