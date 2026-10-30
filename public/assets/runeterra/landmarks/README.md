# Monumentos 3D de Runeterra

Arte © Riot Games. Uso fan, no comercial (Legal Jibber Jabber de Riot). No se hotlinkea nada en runtime.

Fuente: modelos del mapa oficial **Explore Runeterra** (https://map.leagueoflegends.com),
descargados de `https://map.leagueoflegends.com/assets/obj/landmarks/<archivo>`.
El mapa oficial está hecho con three.js y carga estos `.obj` (sin `.mtl`: la textura se asigna por código).

## models/ (originales, sin modificar)

| Monumento (slug del POI) | Modelo(s) | Textura |
|---|---|---|
| Gran ciudad de Demacia (`demacia-city-landmark`) | demacia-city-landmark.obj | demacia-city-landmark.jpg |
| Bastión Inmortal (`immortal-bastion`) | immortal-bastion.obj | immortal-bastion.jpg |
| Disco Solar (`sun-disc`) | sun-disc.obj | sun-disc.jpg |
| Monte Targon (`mount-targon`) | mount-targon.obj | mount-targon.png |
| Fuerte Helado (`frostguard`) | frostguard.obj | frostguard.jpg |
| Placidium de Navori (`placidium`) | placidium.obj | placidium.png |
| El Vacío / Icathia (`the-void`) | the-void.obj | the-void.jpg |
| Ixaocan (`ixaocan`) | ixaocan.obj + ixaocan_orbs.obj, ixaocan_ground.obj | ixaocan.png (orbes también), ixaocan_shadow.png (suelo) |

`placement.json` = bloque `children` de cada pin en `loc/pins-*.json` oficial:
`scale`, `rotY`, `offsetX/Y/Z` (unidades del mapa oficial; 1 unidad ≈ 3.97 px del mapa 8192).
El código oficial hace: `mesh.scale.setScalar(scale); mesh.rotation.x = PI/2; mesh.rotation.y = rotY; mesh.position.set(offsetX, offsetY, offsetZ)`
y lo pinta con un ShaderMaterial sin luces (la iluminación va horneada en la textura → usa material "unlit"/Basic).

### Ver los modelos

- Windows: abre el `.obj` con **Visor 3D** y arrastra la textura, o usa https://3dviewer.net (arrastra el `.obj` y su `.jpg/.png` a la vez).
- Blender: File → Import → Wavefront (.obj), y en el material conecta la textura a *Emission* / *Base Color*.
- three.js: `OBJLoader` + `MeshBasicMaterial({ map })` (Y arriba en el archivo).

## sprites/ (lo que usa la app)

Render de cada monumento a WebP con fondo transparente (three.js en Chrome headless, cámara
ortográfica inclinada 40° desde el sur, 16 px por unidad oficial ⇒ 1:1 con la pantalla a zoom 6).
Metadatos en `src/features/mapa/landmarks3d.json` (`w`, `h`, `anchorX/anchorY` = centro de la base del modelo,
que se coloca sobre el pin del POI; `pinX/pinY` = origen oficial del modelo).

En el Mapa se muestran como `L.imageOverlay` (escalan con el zoom) desde zoom 2.25, con el chip **Monumentos 3D**.
Script de render: `scripts/landmarks-render.js` (necesita `three`, no es dependencia de la app).
