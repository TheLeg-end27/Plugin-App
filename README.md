# Phishing Detector — Extención Chrome

> TFM · Máster en Ciberseguridad · UAX  
> Implementación de un plugin web que detecte la antigüedad de una página web al acceder a ella

![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![WXT](https://img.shields.io/badge/WXT-0.20-FF6B35)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ¿Qué es esto?

Plugin para Chrome que analiza en tiempo real la antigüedad de los dominios visitados como indicador de riesgo de phishing. Mientras Google Safe Browsing detecta solo el 18,4% de los sitios de phishing con un retraso medio de 4,5 días (Kiho Lee et al., 2025), este sistema opera en **tiempo cero** desde el primer acceso al dominio, basándose en señales de infraestructura en lugar de listas negras reactivas.

### Cómo funciona

Cuando navegas a una página, el plugin:

1. Extrae el dominio raíz (eTLD+1) de la URL usando la Public Suffix List
2. Localiza el servidor RDAP autoritativo para el TLD mediante bootstrapping IANA (RFC 9224)
3. Consulta la fecha de registro del dominio vía RDAP
4. Calcula la entropía de Shannon del nombre de dominio como indicador de DGA
5. Combina ambas señales en un score de riesgo [0–100]
6. Muestra el resultado en el badge del icono y, si el riesgo es alto, en un banner contextual

```
Score = 0.60 · score_edad + 0.25 · score_entropía + 0.10 · score_VT + 0.05 · score_TLS
```

---

## Niveles de riesgo

| Score | Nivel | Color |
|-------|-------|-------|----------------|
| 0–30 | Bajo | 🟢 Verde |
| 31–60 | Moderado | 🟡 Ámbar |
| 61–100 | Crítico | 🔴 Rojo |

---

## Resultados de evaluación

Evaluado sobre 1.000 dominios etiquetados (500 PhishTank + 500 Tranco Top 1M):

| Umbral | Precisión | Recall | F1 | FPR | Accuracy |
|--------|-----------|--------|----|-----|----------|
| 25 | 0.745 | 0.828 | 0.784 | 0.284 | 0.772 |
| **40** | **0.776** | **0.816** | **0.795** | **0.236** | **0.790** |
| 50 | 0.892 | 0.562 | 0.690 | 0.068 | 0.747 |
| 60 | 0.984 | 0.376 | 0.544 | 0.006 | 0.685 |
| 75 | **1.000** | 0.184 | 0.311 | **0.000** | 0.592 |

**AUC estimado: 0.82** · Cobertura RDAP: 67.9% · Umbral óptimo: 40

> A umbral 75 (nivel crítico), el sistema alcanza **precisión con FPR = 0** — el banner nunca se activa sobre dominios legítimos maduros.

---

## Requisitos

- Node.js ≥ 18
- npm ≥ 9
- Google Chrome (o cualquier navegador Chromium)
- Cuenta en [VirusTotal](https://www.virustotal.com) para API key gratuita (opcional)

---

## Instalación y desarrollo

### Cargar en Chrome manualmente

1. Ve a `chrome://extensions`
2. Activa **Modo desarrollador** (esquina superior derecha)
3. Pulsa **Cargar descomprimida**
4. Selecciona la carpeta `.output/chrome-mv3/`

---

## Permisos requeridos

| Permiso | Uso |
|---------|-----|
| `webNavigation` | Detectar navegaciones a nuevas URLs |
| `storage` | Caché local y configuración |
| `activeTab` | Leer URL de la pestaña activa en el popup |
| `scripting` | Inyectar el banner de alerta en la página |
| `host_permissions: <all_urls>` | Fetch a servidores RDAP y APIs externas |

---

## Privacidad

- Solo se transmite el **dominio raíz** (ej: `ejemplo.com`) a servidores externos
- No se envían rutas, parámetros de URL, cookies ni identificadores del usuario
- No se almacena historial de navegación
- Todo el procesamiento ocurre localmente en el Service Worker
- El usuario puede vaciar la caché en cualquier momento desde el popup

---

## Stack tecnológico

| Componente | Tecnología |
|-----------|-----------|
| Framework | [WXT](https://wxt.dev) 0.20 |
| Lenguaje | TypeScript 5.x |
| Estándar | Chrome Manifest V3 |
| Parsing de dominios | [tldts](https://github.com/nicolo-ribaudo/tldts) |
| Protocolo de datos | RDAP (RFC 9224) |
| API de reputación | VirusTotal API v3 (opcional) |
| Evaluación | Node.js + tsx |
| Gráficas | Python + matplotlib |

---

## Referencia académica

Este plugin es el artefacto técnico del Trabajo de Fin de Máster:

> **Implementación de un plugin web que detecte la antigüedad de una página web al acceder a ella**  
> Máster en Ciberseguridad · Universidad Alfonso X el Sabio (UAX) · 2026

### Referencias

[1]	Abdolrazzagh-Nezhad, M., & Langarib, N. (2025). Phishing Detection Techniques: A review. Data Science: Journal of Computing and Applied Informatics, 9, 32–46. https://doi.org/10.32734/jocai.v9.i1-19904
[2]	Ahmad, S., Zaman, M., Al-Shamayleh, A. S., Ahmad, R., Abdulhamid, S. M., Ergen, I., & Akhunzada, A. (2025). Across the spectrum in-depth review AI-based models for phishing detection. IEEE Open Journal of the Communications Society, 6, 2065–2085. https://doi.org/10.1109/OJCOMS.2024.3462503
[3]	AHRQ Patient Safety Network (PSNet) . (2024). Alert fatigue. https://psnet.ahrq.gov/primer/alert-fatigue
[4]	Angel, O.-C., Pérez, M., Pagán, C., Padilla-Vega, R., & Cruz, J. (2025). Analyzing website characteristics and their impact on web traffic and legitimacy classification for phishing detection: A structural equation modeling approach. Issues in Information Systems, 26(2), 150–161. https://iacis.org/iis/2025/2_iis_2025_150-161.pdf
[5]	Anti-Phishing Working Group (APWG). (2026, February 18). Phishing activity trends report, 4th quarter 2025. https://docs.apwg.org/reports/apwg_trends_report_q4_2025.pdf
[6]	Blanchet, M. (2022, March). RFC 9224: Finding the Authoritative Registration Data Access Protocol (RDAP) Service. https://www.rfc-editor.org/rfc/rfc9224.html
[7]	Brightside. (2025, October 24). AI-generated phishing vs human attacks: 2025 risk analysis. Brightside AI Blog. https://www.brside.com/blog/ai-generated-phishing-vs-human-attacks-2025-risk-analysis
[8]	CA/Browser Forum. (2025, April 11). Ballot SC081V3: Introduce schedule of reducing validity and data reuse periods. https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/
[9]	Castillo, C. (2026, March 6). Balance de ciberseguridad 2025 de INCIBE: Análisis, tendencias y claves estratégicas. Elantia. https://elantia.es/balance-de-ciberseguridad-2025-de-incibe/
[10]	Cisco Talos Intelligence Group. (n.d.). PhishTank | Join the fight against phishing. https://www.phishtank.com/
[11]	España Digital. (2026). INCIBE gestionó 122.223 incidentes de ciberseguridad en 2025, un 26% más que el año anterior. https://espanadigital.gob.es/ca/actualidad/incibe-gestiono-122223-incidentes-de-ciberseguridad-en-2025-un-26-mas-que-el-ano
[12]	Falade, P. V. (2023). Decoding the threat landscape: ChatGPT, FraudGPT, and WormGPT in social engineering attacks. International Journal of Scientific Research in Computer Science, Engineering and Information Technology, 185–198. https://doi.org/10.32628/cseit2390533
[13]	Gañán, C. (2021). A primer in Registration Data Access Protocol (RDAP) performance. ICANN. https://www.icann.org/en/system/files/files/octo-024-17may21-en.pdf
[14]	Gibbs, E. (2024, October 25). Newly registered domains: To block or not to block? Forbes. https://www.forbes.com/councils/forbestechcouncil/2024/10/25/newly-registered-domains-to-block-or-not-to-block/
[15]	Google. (n.d.). Chrome Extensions – Manifest V3. https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3?hl=es-419
[16]	Google. (n.d.). What is Safe Browsing? Google Safe Browsing. https://developers.google.com/safe-browsing?hl=es-419
[17]	IBM. (2025). Cost of a data breach 2025. https://www.ibm.com/reports/data-breach
[18]	ICANN. (2018). Temporary specification for gTLD registration data. https://www.icann.org/resources/pages/gtld-registration-data-specs-en/
[19]	ICANN. (2024, February 21). RDAP response profile. https://itp.cdn.icann.org/en/files/registry-operators/rdap-response-profile-21feb24-en.pdf
[20]	Instituto Nacional de Ciberseguridad (INCIBE). (2026, February 9). INCIBE detectó más de 122.000 incidentes de ciberseguridad en 2025. https://www.incibe.es/incibe/sala-de-prensa/incibe-detecto-mas-de-122000-incidentes-de-ciberseguridad-en-2025
[21]	Khalil, M. (2025, April 29). Phishing statistics 2026: Latest trends & risks. DeepStrike. https://deepstrike.io/blog/Phishing-Statistics-2025
[22]	Klinker, A. (2023). Next-Gen Web Extension Framework. WXT. https://wxt.dev/
[23]	Kumi, S., Lim, C., & Lee, S. G. (2021). Malicious URL detection based on associative classification. Entropy, 23(2), 182. https://doi.org/10.3390/e23020182
[24]	Le Page, A., et al. (2018). DNS-based detection of newly registered domains used in malicious campaigns. USENIX Security.
[25]	Le Pochat, V., Van Goethem, T., Tajalizadehkhoob, S., Korczyński, M., & Joosen, W. (2019). Tranco: A research-oriented top sites ranking hardened against manipulation. Proceedings of the 26th Annual Network and Distributed System Security Symposium (NDSS 2019). https://doi.org/10.14722/ndss.2019.23386
[26]	Lee, K., Lim, K., Kim, H., Kwon, Y., & Kim, D. (2025). 7 days later: Analyzing phishing-site lifespan after detected. In Proceedings of the ACM on Web Conference 2025 (WWW '25) (pp. 945–956). ACM. https://doi.org/10.1145/3696410.3714678
[27]	Mathew, J. A., Philip, N. S., & Jacob, J. (2025). Detecting algorithmically generated domains using entropy and lexical features. International Journal of Computer Applications, 187(44), 37–44. https://doi.org/10.5120/ijca2025925758
[28]	Mozilla Foundation. (n.d.). Public suffix list. https://publicsuffix.org/
[29]	Namazi, C. (2019, October 23). Evolution of WHOIS protocol to RDAP – What you need to know. ICANN. https://www.icann.org/en/blogs/details/evolution-of-whois-protocol-to-rdap---what-you-need-to-know-23-10-2019-en
[30]	NameSilo Staff. (2026, January 15). WHOIS vs RDAP: What's different and why it changed. NameSilo Blog. https://www.namesilo.com/blog/en/whois-rdap/whois-vs-rdap-whats-different-and-why-it-changed
[31]	Nguessan, E. A. (2026). Enhancing phishing detection through human-centered interface design: A framework, prototype, and behavioral validation. International Journal for Research in Applied Science and Engineering Technology, 14(3), 929–937. https://doi.org/10.22214/ijraset.2026.77885
[32]	Olenick, D. (2019, August 22). Vast majority of newly registered domains are malicious. SC Media. https://www.scworld.com/news/vast-majority-of-newly-registered-domains-are-malicious
[33]	OpenPhish. (n.d.). OpenPhish database. https://openphish.com/phishing_database.html
[34]	Pelekoudas, A. P., Bolis, E., Lindner, J., Kyriakidis, P., Davidsen, M., Hansen, J. T. E., Reichkendler, C. H., & Homayoun, S. (2026). TLS certificate and domain feature analysis of phishing domains in the Danish .dk namespace [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2603.21652
[35]	Qahtani, N. (2025). Designing intelligent user interfaces for real-time phishing detection and education. ResearchGate. https://www.researchgate.net/publication/396321596_Designing_Intelligent_User_Interfaces_for_Real-Time_Phishing_Detection_and_Education
[36]	RDAP.ORG. (2021). About RDAP. https://about.rdap.org/
[37]	Roy, S. S., & Nilizadeh, S. (2024). PhishLang: A real-time, fully client-side phishing detection framework using MobileBERT. arXiv preprint arXiv:2408.05667.
[38]	Snapper, J. (2024). 33 phishing statistics in 2025 every MSP should know about. Guardz. https://guardz.com/blog/33-phishing-statistics-every-msp-should-know-about/
[39]	Statcounter. (n.d.). Browser market share worldwide. https://gs.statcounter.com/browser-market-share
[40]	urlscan GmbH. (n.d.). APIs – Introduction. urlscan.io. https://docs.urlscan.io/pages/api-intro
[41]	VirusTotal. (n.d.). VirusTotal API v3 overview. https://docs.virustotal.com/reference/
[42]	Wong, A. (2023). Detecting domain-generation algorithm (DGA) based fully-qualified domain names (FQDNs) with Shannon entropy. https://doi.org/10.48550/arXiv.2304.07943
[43]	World Wide Web Consortium (W3C). (n.d.). WCAG 2 overview. Web Accessibility Initiative (WAI). https://www.w3.org/WAI/standards-guidelines/wcag/#intro
[44]	Zieni, R., Massari, L., & Calzarossa, M. C. (2023). Phishing or not phishing? A survey on the detection of phishing websites. IEEE Access, 11, 18499–18519. https://doi.org/10.1109/ACCESS.2023.3247135

---

## Licencia

MIT © 2026
