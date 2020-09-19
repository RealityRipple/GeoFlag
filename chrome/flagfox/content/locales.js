"use strict";  // Use ES5 strict mode for this file

// List of language names to display for locale credits (English names listed here for reference)
const native_language_names =
{
    "ar" : "العربية",                  // Arabic
    "bg" : "Български",                // Bulgarian
    "bn-IN" : "বাংলা",                  // Bengali
    "ca" : "Català",                   // Catalan
    "cs" : "Čeština",                  // Czech
    "da" : "Dansk",                    // Danish
    "de" : "Deutsch",                  // German
    "el" : "Ελληνικά",                 // Greek
    "es-ES" : "Español",               // Spanish
    "es-AR" : "Español (Argentina)",   // Argentinian Spanish
    "fa" : "فارسی",                    // Persian
    "fi" : "suomi",                    // Finnish
    "fr" : "Français",                 // French
    "he" : "עברית",                    // Hebrew
    "hr" : "Hrvatski",                 // Croatian
    "hu" : "Magyar",                   // Hungarian
    "hy-AM" : "Հայերեն",               // Armenian
    "is" : "Íslenska",                 // Icelandic
    "it" : "Italiano",                 // Italian
    "ja" : "日本語",                    // Japanese
    "ko" : "한국어",                    // Korean
    "lt" : "lietuvių kalba",           // Lithuanian
    "lv" : "Latviešu",                 // Latvian
    "mk" : "Македонски",               // Macedonian
    "ms-MY" : "Bahasa Melayu",         // Malaysian
    "nl" : "Nederlands",               // Dutch
    "pl" : "polski",                   // Polish
    "pt-BR" : "Português (Brasil)",    // Brazilian Portuguese
    "pt-PT" : "Português",             // Portuguese
    "ro" : "Română",                   // Romanian
    "ru" : "Pyccĸий",                  // Russian
    "sl-SI" : "Slovenščina",           // Slovenian
    "sr" : "Српски",                   // Serbian
    "sv-SE" : "Svenska",               // Swedish
    "tr" : "Türkçe",                   // Turkish
    "uk-UA" : "Українська",            // Ukrainian
    "vi" : "Tiếng Việt",               // Vietnamese
    "zh-CN" : "中文 (简体)",            // Simplified Chinese
    "zh-TW" : "正體中文 (繁體)"          // Traditional Chinese
};

// List of flags to show for each team of translators (locale code -> country code)
const language_flags =
{
    "ar" : "sa",
    "bg" : "bg",
    "bn-IN" : "in",
    "ca" : "ad",
    "cs" : "cz",
    "da" : "dk",
    "de" : "de",
    "el" : "gr",
    "es-ES" : "es",
    "es-AR" : "ar",
    "fa" : "ir",
    "fi" : "fi",
    "fr" : "fr",
    "he" : "il",
    "hr" : "hr",
    "hu" : "hu",
    "hy-AM" : "am",
    "is" : "is",
    "it" : "it",
    "ja" : "jp",
    "ko" : "kr",
    "lt" : "lt",
    "lv" : "lv",
    "mk" : "mk",
    "ms-MY" : "my",
    "nl" : "nl",
    "pl" : "pl",
    "pt-BR" : "br",
    "pt-PT" : "pt",
    "ro" : "ro",
    "ru" : "ru",
    "sl-SI": "si",
    "sr" : "rs",
    "sv-SE" : "se",
    "tr" : "tr",
    "uk-UA" : "ua",
    "vi" : "vn",
    "zh-CN" : "cn",
    "zh-TW" : "tw"
};

// Translators are listed alphabetically by locale code, then in order of contribution (first contributors first)
const translator_credits =
[
 /* ["locale code","translator name"],     // BabelZilla username (notes) */
    ["ar","Nassim J Dhaher"],              // NassimJD
    ["ar","Natty Dreed"],                  // Natty Dreed
    ["ar","Mutaz Ismail"],                 // mutaz
    ["bg","Стоян Димитров (stoyan)"],      // stoyan
    ["bg","Ivaylo"],                       // Ivaylo
    //["bn-IN","Soham Chatterjee"],        // soham_chatterjee (INCOMPLETE; last completed and included in Flagfox 3.3.x)
    ["ca","Kampana"],                      // kampana
    ["ca","Adrià Laviós"],                 // elGoomba
    ["cs","Davis"],                        // davis776
    ["cs","strepon"],                      // strepon (no longer available)
    ["da","Joergen"],                      // Joergen
    ["de","Marco Rist"],                   // (pre-BabelZilla translator)
    ["de","Wawuschel"],                    // Wawuschel
    ["de","Team erweiterungen.de"],        // Team erweiterungen.de
    ["el","George Fiotakis"],              // Sonickydon
    //["en-US","Dave Garrett"],            // DaveG (just listing my username here for completeness)
    ["es-AR","Eduardo Leon"],              // EduLeo
    ["es-AR","acushnir"],                  // acushnir
    ["es-ES","urko"],                      // urko
    //["fa","Pedram Veisi"],               // Pedram Veisi (INCOMPLETE; last completed and included in Flagfox 4.2.x)
    //["fa","bahramm"],                    // bahramm (INCOMPLETE; last completed and included in Flagfox 4.2.x)
    //["fa","Reza NA"],                    // Reza_NA (INCOMPLETE; last completed and included in Flagfox 4.2.x)
    //["fa","Pouyan"],                     // pouyan (INCOMPLETE; last completed and included in Flagfox 4.2.x)
    ["fi","Risse"],                        // Risse
    ["fi","Tommi Rautava"],                // kenmooda
    ["fi","AtteL"],                        // AtteL
    ["fi","Jiipee"],                       // Jiipee
    ["fr","risbo"],                        // (pre-BabelZilla translator)
    ["fr","Goofy"],                        // Goofy
    ["he","Uri Hartmann"],                 // (no longer available)
    ["he","SiiiE"],                        // SiiiE
    ["hr","Goran Vidović"],                // gogo
    ["hu","kami"],                         // kami
    ["hu","SkH"],                          // SkH
    ["hy-AM","Hrant Ohanyan"],             // HrantOhanyan
    ["is","Kristján Bjarni Guðmundsson"],  // kristjan
    ["it","Marco Guadagnini"],             // Garibaldi (pre-BabelZilla translator)
    ["ja","drry"],                         // drry
    ["ja","Haebaru"],                      // Haebaru
    ["ko","용오름 (Wtspout)"],              // wtspout
    ["lt","Rytis Savickis"],               // rytis
    ["lt","Algimantas Margevičius"],       // gymka
    ["lt","Barkod"],                       // tomasdd
    ["lv","Arabiks"],                      // Arabiks_
    ["lv","latvian87"],                    // latvian87
    //["mk","Ivan Jonoski"],               // renegade06 (INCOMPLETE; last completed and included in Flagfox 4.0.x)
    ["ms-MY","Saiful Haziq AS"],           // sepol05278
    //["nb-NO","jaknudsen"],               // jaknudsen (INCOMPLETE; never completed; never included)
    ["nl","Mark Heijl"],                   // markh
    //["nn-NO","Bjørn I. Svindseth"],      // bjorni (INCOMPLETE; never completed; never included)
    ["pl","Krzysztof Klimczak"],           // momus
    ["pt-BR","gulego"],                    // gulego
    ["pt-BR","Humberto Sartini"],          // humbertosartini
    ["pt-BR","Edgard Dias Magalhaes"],     // edgard.magalhaes
    ["pt-PT","Carlos Simão"],              // lloco
    ["pt-PT","Ricardo Simões"],            // ricardosimoes
    ["ro","Cătălin Zamfirescu"],           // x10firefox
    ["ru","Timur Timirkhanov"],            // TLemur
    ["ru","Anton Pinsky"],                 // Pinsky
    ["ru","Salted"],                       // Salted
    ["sl-SI","Peter Klofutar"],            // Klofutar
    ["sr","kapetance"],                    // kapetance
    ["sr","Strahinja Kustudić"],           // kustodian
    ["sr","ДакСРБИЈА (DakSrbija)"],        // DakSrbija
    ["sv-SE","StiffeL"],                   // (no longer available)
    ["sv-SE","Natanael"],                  // Natanael_L01
    ["sv-SE","Mikael Hiort af Ornäs"],     // Lakrits
    ["tr","MysticFox"],                    // (no longer available)
    ["tr","Serdar ŞAHİN"],                 // SerdarSahin
    ["uk-UA","Sappa"],                     // (no longer available)
    ["uk-UA","Zhouck"],                    // Zhouck
    //["uz","Avaz Ibragimov"],             // avaz (INCOMPLETE; never completed; never included)
    ["vi","NGUYỄN Mạnh Hùng"],             // loveleeyoungae
    ["vi","Nguyễn Hoàng Long"],            // longnh
    ["vi","Minh Nguyễn"],                  // mxn
    ["zh-CN","fishbone"],                  // fishbone
    ["zh-CN","fiag"],                      // fiag
    ["zh-CN","blackdire"],                 // blackdire
    ["zh-TW","kiol ou"],                   // ttakiol
    ["zh-TW","Tang Kai Yiu"]               // TKY
];
