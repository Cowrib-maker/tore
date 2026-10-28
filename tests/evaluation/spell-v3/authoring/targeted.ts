/**
 * MODEL-AUTHORED targeted items (provenance MODEL_ASSISTANT), 2026-10-08. NOT native-authored, NOT native-reviewed.
 * Each entry: [token, expected verdict, correction?, note]. "expected" is the assistant's judgment — the thing native review must confirm.
 */
export type Targeted = { set: string; category: string; items: [token: string, expected: "VALID" | "MISSPELLED" | "UNKNOWN", correction: string | null, note: string][] };

export const TARGETED: Targeted[] = [
  {
    set: "O_COMMON_TYPOS", category: "MISSPELLED",
    items: [
      ["надэд", "MISSPELLED", "надад", "wrong harmony"], ["чамд", "VALID", null, "control: valid dative"], ["хууль", "VALID", null, "control"],
      ["хуулийг", "VALID", null, "control"], ["хуулиг", "MISSPELLED", "хуулийг", "и for ий"], ["гэртээ", "VALID", null, "control"],
      ["гэрийнхээ", "VALID", null, "control"], ["ажилласан", "VALID", null, "control"], ["ажиллсан", "MISSPELLED", "ажилласан", "dropped stem vowel"],
      ["шалгсан", "MISSPELLED", "шалгасан", "dropped stem vowel"], ["тоглсон", "MISSPELLED", "тоглосон", "dropped stem vowel"], ["ойлгсон", "MISSPELLED", "ойлгосон", "dropped stem vowel"],
      ["сонгсон", "MISSPELLED", "сонгосон", "dropped stem vowel"], ["дүгнсэн", "MISSPELLED", "дүгнэсэн", "dropped stem vowel"], ["нотлсон", "MISSPELLED", "нотолсон", "dropped stem vowel"],
      ["хамтрсан", "MISSPELLED", "хамтарсан", "dropped stem vowel"], ["амрсан", "MISSPELLED", "амарсан", "dropped stem vowel"], ["шүүмжилсан", "MISSPELLED", "шүүмжилсэн", "wrong harmony"],
      ["оруулсэн", "MISSPELLED", "оруулсан", "wrong harmony"], ["сайжирсэн", "MISSPELLED", "сайжирсан", "wrong harmony"], ["мэдэгдсан", "MISSPELLED", "мэдэгдсэн", "wrong harmony"],
      ["найдвартэй", "MISSPELLED", "найдвартай", "wrong harmony (comitative)"], ["тавагтэй", "MISSPELLED", "тавагтай", "wrong harmony (comitative)"], ["шаардлагатэй", "MISSPELLED", "шаардлагатай", "wrong harmony (comitative)"],
      ["хөгжилтай", "MISSPELLED", "хөгжилтэй", "wrong harmony (comitative)"], ["төвөгтай", "MISSPELLED", "төвөгтэй", "wrong harmony (comitative)"], ["энергитай", "MISSPELLED", "энергитэй", "wrong harmony (comitative)"],
      ["төслууд", "MISSPELLED", "төслүүд", "wrong harmony (plural)"], ["шинууд", "MISSPELLED", "шинүүд", "wrong harmony (plural)"], ["тээврын", "MISSPELLED", "тээврийн", "ы for ий (feminine stem)"],
      ["өвчны", "MISSPELLED", "өвчний", "ы for ий"], ["шилжилтын", "MISSPELLED", "шилжилтийн", "ы for ий"], ["техникыг", "MISSPELLED", "техникийг", "ыг for ийг (к-final)"],
      ["сургуулыг", "MISSPELLED", "сургуулийг", "ыг for ийг"], ["үзэгчдын", "MISSPELLED", "үзэгчдийн", "plural stem + ы"], ["жүжигчдын", "MISSPELLED", "жүжигчдийн", "plural stem + ы"],
      ["цомогг", "MISSPELLED", "цомог", "doubled final"], ["алхх", "MISSPELLED", "алх", "doubled final"], ["ярьжж", "MISSPELLED", "ярьж", "doubled final"],
      ["хувийгг", "MISSPELLED", "хувийг", "doubled final"], ["тоннн", "MISSPELLED", "тонн", "tripled final"], ["үгүйй", "MISSPELLED", "үгүй", "doubled final й"],
      ["хоер", "MISSPELLED", "хоёр", "ё→е"], ["соел", "MISSPELLED", "соёл", "ё→е"], ["томъео", "MISSPELLED", "томъёо", "ё→е"],
      ["уйлдвэр", "MISSPELLED", "үйлдвэр", "у for ү"], ["хүрдан", "MISSPELLED", "хурдан", "ү for у"], ["технилоги", "MISSPELLED", "технологи", "vowel confusion"],
      ["сонгдог", "MISSPELLED", "сонгодог", "dropped vowel"], ["хянадаг", "VALID", null, "control"], ["хяндаг", "MISSPELLED", "хянадаг", "dropped stem vowel"],
      ["тайлбарллаа", "MISSPELLED", "тайлбарлалаа", "consonant cluster / dropped vowel"], ["танилцуулнэ", "MISSPELLED", "танилцуулна", "wrong harmony (future)"],
      ["хэдэнтаа", "MISSPELLED", "хэдэнтээ", "wrong harmony"], ["хүргэё", "UNKNOWN", null, "ё/е hortative variant — native judgment needed"],
      ["чихраа", "MISSPELLED", "чихрээ", "wrong harmony (reflexive)"], ["ирнээ", "MISSPELLED", "ирнэ", "unclear: native judgment needed"],
      ["хамт", "VALID", null, "control"], ["хамтт", "UNKNOWN", null, "double т is loan-prone: engine abstains by design"], ["холл", "UNKNOWN", null, "loanword hall: must not be accused"],
    ],
  },
  {
    set: "L_ABBREVIATIONS", category: "ABBREVIATION",
    items: [
      ["УИХ", "VALID", null, "State Great Khural"], ["ЗГ", "UNKNOWN", null, "context-dependent"], ["НӨАТ", "VALID", null, "VAT"], ["ХХК", "VALID", null, "LLC"],
      ["ТӨК", "UNKNOWN", null, "state-owned enterprise abbreviation variants"], ["ААН", "VALID", null, "business entity"], ["ЕБС", "VALID", null, "general education school"],
      ["МУИС", "VALID", null, "National University of Mongolia"], ["ШУТИС", "VALID", null, "university"], ["ГХЯ", "UNKNOWN", null, "ministry abbreviation, native check"],
      ["т.", "UNKNOWN", null, "initial / abbreviation dot"], ["г.м.", "VALID", null, "etc."], ["ж.нь", "VALID", null, "for example"], ["тн", "VALID", null, "tonnes"],
      ["км", "VALID", null, "kilometre"], ["кг", "VALID", null, "kilogram"], ["мм", "VALID", null, "millimetre"], ["ХХК-ийн", "UNKNOWN", null, "abbreviation + suffix"],
    ],
  },
  {
    set: "M_COMPOUNDS", category: "COMPOUND",
    items: [
      ["өнөөдөр", "VALID", null, "lexicalized glued compound"], ["өнөөгийн", "VALID", null, "genitive of өнөөдөр's stem"], ["улстөрч", "UNKNOWN", null, "politician: native judgment on glued form"],
      ["хөрөнгөоруулалт", "MISSPELLED", "хөрөнгө оруулалт", "two words glued: the standard is separate"], ["нягтланбодогч", "MISSPELLED", "нягтлан бодогч", "glued"], ["засгийнгазар", "MISSPELLED", "Засгийн газар", "glued"],
      ["орон сууц", "VALID", null, "two-word term"], ["эдийн засаг", "VALID", null, "two-word term"], ["хөдөлмөрийнхөнгийн", "UNKNOWN", null, "garbage concatenation: must NOT be VALID"],
      ["арваннэгдүгээр", "VALID", null, "ordinal compound as news writes it"], ["хоёроос", "VALID", null, "numeral + case"], ["хэрэглэгчдийнхээ", "VALID", null, "derived + plural + genitive + reflexive"],
      ["харилцаахолбоо", "MISSPELLED", "харилцаа холбоо", "glued"], ["байгальорчин", "MISSPELLED", "байгаль орчин", "glued"],
    ],
  },
  {
    set: "N_INFLECTION", category: "INFLECTION",
    items: [
      ["байгаагийн", "VALID", null, "long-vowel genitive"], ["хүүгийн", "VALID", null, "long-vowel genitive"], ["хотынх", "VALID", null, "genitive nominalizer"], ["багийнхан", "VALID", null, "genitive nominalizer + collective"],
      ["ашиглан", "VALID", null, "-н converb"], ["оруулан", "VALID", null, "-н converb"], ["байдаггүй", "VALID", null, "habitual + гүй"], ["байдгийг", "VALID", null, "habitual elision + acc"],
      ["болсныг", "VALID", null, "participle elision + acc"], ["зохиолчдын", "VALID", null, "agent plural stem"], ["үзэсгэлэнгийн", "VALID", null, "hidden-г"], ["төгрөгөөр", "VALID", null, "instrumental"],
      ["байдагийг", "UNKNOWN", null, "un-elided participle: not a standard form"], ["хаалгагийн", "UNKNOWN", null, "short vowel stem never takes гийн"], ["хотийнх", "UNKNOWN", null, "wrong harmony inside nominalized stem"],
      ["усны", "VALID", null, "ус→усны"], ["гишүүний", "VALID", null, "гишүүн→гишүүний"], ["эцгийн", "VALID", null, "эцэг→эцгийн"], ["эхийн", "VALID", null, "эх→эхийн"],
    ],
  },
  {
    set: "J_PROPER_NAMES_EXTRA", category: "PROPER_NAME",
    items: [
      ["Болд", "VALID", null, "given name"], ["Болдод", "VALID", null, "name + dative"], ["Сарнайн", "VALID", null, "name + genitive"], ["Тэмүүлэн", "UNKNOWN", null, "name, not in lexicon"],
      ["Хөвсгөл", "VALID", null, "aimag"], ["Хөвсгөлийн", "VALID", null, "aimag genitive"], ["Дархан-Уул", "UNKNOWN", null, "hyphenated place"], ["Улаанбаатарт", "VALID", null, "city + dative"],
      ["Мөнхжин", "UNKNOWN", null, "name, not in lexicon: must not be MISSPELLED"], ["Нямсүрэн", "UNKNOWN", null, "name"], ["Д.Сүхбаатар", "UNKNOWN", null, "initial + surname"],
      ["Apple", "UNKNOWN", null, "Latin brand token: never MISSPELLED"], ["Microsoft-ийн", "UNKNOWN", null, "Latin + Mongolian suffix"], ["Голомт", "VALID", null, "bank"], ["Хаан", "VALID", null, "bank / title"],
    ],
  },
  {
    set: "K_LOANWORDS_EXTRA", category: "LOANWORD",
    items: [
      ["компьютер", "VALID", null, "accepted loan"], ["компьютерийн", "VALID", null, "accepted loan + genitive"], ["программ", "VALID", null, "accepted loan"], ["аппликейшн", "UNKNOWN", null, "transliteration, native judgment"],
      ["интернэт", "UNKNOWN", null, "variant spelling of интернет"], ["менежер", "VALID", null, "accepted"], ["бизнес", "VALID", null, "accepted"], ["маркетинг", "UNKNOWN", null, "accepted? native judgment"],
      ["онлайн", "UNKNOWN", null, "anglicism in wide use"], ["вайфай", "UNKNOWN", null, "technical loan"], ["софтвер", "UNKNOWN", null, "non-standard transliteration"], ["флаш", "UNKNOWN", null, "loan"],
      ["сервер", "VALID", null, "accepted"], ["сайт", "VALID", null, "accepted"], ["email", "UNKNOWN", null, "Latin token: never MISSPELLED"], ["WiFi", "UNKNOWN", null, "Latin"],
    ],
  },
];
