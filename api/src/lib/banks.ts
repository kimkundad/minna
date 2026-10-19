/**
 * Where a teacher banks.
 *
 * Two lists and one validator, kept small on purpose.
 *
 * There is no worldwide register of banks anybody can ship in a file, and a
 * half-finished one is worse than none: a teacher whose bank is missing from
 * the dropdown cannot be paid. So the country is a closed list, the bank is
 * free text everywhere except Thailand, and the one piece that identifies a
 * bank internationally — the SWIFT/BIC code — is checked for shape.
 */

/**
 * The countries the school can pay into.
 *
 * The list the school supplied, which is every country a transfer can
 * reasonably be sent to from here — not the whole ISO list, and not the
 * nineteen this started with either. Nineteen covered where the teachers were
 * at the time, and a teacher whose country is missing cannot be paid at all,
 * which is a worse failure than a longer dropdown.
 *
 * Alphabetical by English name, because that is the order somebody scrolling
 * expects and the order the school wrote them in.
 */
export const PAYOUT_COUNTRIES: { code: string; name: { en: string; th: string } }[] = [
  { code: 'AD', name: { en: 'Andorra', th: 'อันดอร์รา' } },
  { code: 'AR', name: { en: 'Argentina', th: 'อาร์เจนตินา' } },
  { code: 'AU', name: { en: 'Australia', th: 'ออสเตรเลีย' } },
  { code: 'AT', name: { en: 'Austria', th: 'ออสเตรีย' } },
  { code: 'BD', name: { en: 'Bangladesh', th: 'บังกลาเทศ' } },
  { code: 'BE', name: { en: 'Belgium', th: 'เบลเยียม' } },
  { code: 'BR', name: { en: 'Brazil', th: 'บราซิล' } },
  { code: 'BG', name: { en: 'Bulgaria', th: 'บัลแกเรีย' } },
  { code: 'CA', name: { en: 'Canada', th: 'แคนาดา' } },
  { code: 'CL', name: { en: 'Chile', th: 'ชิลี' } },
  { code: 'CN', name: { en: 'China', th: 'จีน' } },
  { code: 'CO', name: { en: 'Colombia', th: 'โคลอมเบีย' } },
  { code: 'CR', name: { en: 'Costa Rica', th: 'คอสตาริกา' } },
  { code: 'HR', name: { en: 'Croatia', th: 'โครเอเชีย' } },
  { code: 'CY', name: { en: 'Cyprus', th: 'ไซปรัส' } },
  { code: 'CZ', name: { en: 'Czech Republic', th: 'เช็กเกีย' } },
  { code: 'DK', name: { en: 'Denmark', th: 'เดนมาร์ก' } },
  { code: 'EG', name: { en: 'Egypt', th: 'อียิปต์' } },
  { code: 'EE', name: { en: 'Estonia', th: 'เอสโตเนีย' } },
  { code: 'FI', name: { en: 'Finland', th: 'ฟินแลนด์' } },
  { code: 'FR', name: { en: 'France', th: 'ฝรั่งเศส' } },
  { code: 'GE', name: { en: 'Georgia', th: 'จอร์เจีย' } },
  { code: 'DE', name: { en: 'Germany', th: 'เยอรมนี' } },
  { code: 'GH', name: { en: 'Ghana', th: 'กานา' } },
  { code: 'GR', name: { en: 'Greece', th: 'กรีซ' } },
  { code: 'HK', name: { en: 'Hong Kong', th: 'ฮ่องกง' } },
  { code: 'HU', name: { en: 'Hungary', th: 'ฮังการี' } },
  { code: 'IS', name: { en: 'Iceland', th: 'ไอซ์แลนด์' } },
  { code: 'IN', name: { en: 'India', th: 'อินเดีย' } },
  { code: 'ID', name: { en: 'Indonesia', th: 'อินโดนีเซีย' } },
  { code: 'IE', name: { en: 'Ireland', th: 'ไอร์แลนด์' } },
  { code: 'IT', name: { en: 'Italy', th: 'อิตาลี' } },
  { code: 'JP', name: { en: 'Japan', th: 'ญี่ปุ่น' } },
  { code: 'KE', name: { en: 'Kenya', th: 'เคนยา' } },
  { code: 'LV', name: { en: 'Latvia', th: 'ลัตเวีย' } },
  { code: 'LI', name: { en: 'Liechtenstein', th: 'ลิกเตนสไตน์' } },
  { code: 'LT', name: { en: 'Lithuania', th: 'ลิทัวเนีย' } },
  { code: 'LU', name: { en: 'Luxembourg', th: 'ลักเซมเบิร์ก' } },
  { code: 'MY', name: { en: 'Malaysia', th: 'มาเลเซีย' } },
  { code: 'MT', name: { en: 'Malta', th: 'มอลตา' } },
  { code: 'MX', name: { en: 'Mexico', th: 'เม็กซิโก' } },
  { code: 'MC', name: { en: 'Monaco', th: 'โมนาโก' } },
  { code: 'MA', name: { en: 'Morocco', th: 'โมร็อกโก' } },
  { code: 'NP', name: { en: 'Nepal', th: 'เนปาล' } },
  { code: 'NL', name: { en: 'Netherlands', th: 'เนเธอร์แลนด์' } },
  { code: 'NZ', name: { en: 'New Zealand', th: 'นิวซีแลนด์' } },
  { code: 'NG', name: { en: 'Nigeria', th: 'ไนจีเรีย' } },
  { code: 'NO', name: { en: 'Norway', th: 'นอร์เวย์' } },
  { code: 'PK', name: { en: 'Pakistan', th: 'ปากีสถาน' } },
  { code: 'PH', name: { en: 'Philippines', th: 'ฟิลิปปินส์' } },
  { code: 'PL', name: { en: 'Poland', th: 'โปแลนด์' } },
  { code: 'PT', name: { en: 'Portugal', th: 'โปรตุเกส' } },
  { code: 'RO', name: { en: 'Romania', th: 'โรมาเนีย' } },
  { code: 'SM', name: { en: 'San Marino', th: 'ซานมารีโน' } },
  { code: 'SG', name: { en: 'Singapore', th: 'สิงคโปร์' } },
  { code: 'SK', name: { en: 'Slovakia', th: 'สโลวาเกีย' } },
  { code: 'SI', name: { en: 'Slovenia', th: 'สโลวีเนีย' } },
  { code: 'ZA', name: { en: 'South Africa', th: 'แอฟริกาใต้' } },
  { code: 'KR', name: { en: 'South Korea', th: 'เกาหลีใต้' } },
  { code: 'ES', name: { en: 'Spain', th: 'สเปน' } },
  { code: 'LK', name: { en: 'Sri Lanka', th: 'ศรีลังกา' } },
  { code: 'SE', name: { en: 'Sweden', th: 'สวีเดน' } },
  { code: 'CH', name: { en: 'Switzerland', th: 'สวิตเซอร์แลนด์' } },
  { code: 'TZ', name: { en: 'Tanzania', th: 'แทนซาเนีย' } },
  { code: 'TH', name: { en: 'Thailand', th: 'ไทย' } },
  { code: 'TR', name: { en: 'Turkey', th: 'ตุรกี' } },
  { code: 'UG', name: { en: 'Uganda', th: 'ยูกันดา' } },
  { code: 'UA', name: { en: 'Ukraine', th: 'ยูเครน' } },
  { code: 'AE', name: { en: 'United Arab Emirates', th: 'สหรัฐอาหรับเอมิเรตส์' } },
  { code: 'GB', name: { en: 'United Kingdom', th: 'สหราชอาณาจักร' } },
  { code: 'US', name: { en: 'United States of America', th: 'สหรัฐอเมริกา' } },
  { code: 'UY', name: { en: 'Uruguay', th: 'อุรุกวัย' } },
  { code: 'VA', name: { en: 'Vatican City', th: 'นครวาติกัน' } },
  { code: 'VN', name: { en: 'Vietnam', th: 'เวียดนาม' } },
  { code: 'ZM', name: { en: 'Zambia', th: 'แซมเบีย' } },
  // Not on the school's list, and kept because teachers here bank in it: a
  // country that disappears from a dropdown takes a saved record with it.
  { code: 'TW', name: { en: 'Taiwan', th: 'ไต้หวัน' } },
]

/**
 * The currencies a teacher may ask to be paid in.
 *
 * A different question from what a course is priced in, and it used to be
 * answered with the same list: the eighteen currencies Stripe will take a
 * payment in. A teacher in Nairobi could not ask for shillings because the
 * school does not sell courses in shillings, which has nothing to do with it.
 *
 * Earnings are kept in baht whatever the sale was charged in, so this is a
 * preference recorded against the transfer, not a conversion anything here
 * performs. The school supplied the list.
 *
 * One name each, in English. These are bank-form entries read by whoever is
 * making the transfer, not prices shown to a reader in their own language.
 */
export const PAYOUT_CURRENCIES: { code: string; name: string }[] = [
  { code: 'THB', name: 'Thai baht' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'TWD', name: 'Taiwan dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'VND', name: 'Vietnamese dong' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'ARS', name: 'Argentine peso' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'AZN', name: 'Azerbaijani manat' },
  { code: 'BBD', name: 'Barbadian dollar' },
  { code: 'BHD', name: 'Bahraini dinar' },
  { code: 'BMD', name: 'Bermudian dollar' },
  { code: 'BND', name: 'Brunei dollar' },
  { code: 'BOB', name: 'Bolivian boliviano' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'BSD', name: 'Bahamian dollar' },
  { code: 'BWP', name: 'Botswana pula' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'CLP', name: 'Chilean peso' },
  { code: 'COP', name: 'Colombian peso' },
  { code: 'CRC', name: 'Costa Rican colón' },
  { code: 'CVE', name: 'Cape Verdean escudo' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'DOP', name: 'Dominican peso' },
  { code: 'DZD', name: 'Algerian dinar' },
  { code: 'EGP', name: 'Egyptian pound' },
  { code: 'ETB', name: 'Ethiopian birr' },
  { code: 'FJD', name: 'Fijian dollar' },
  { code: 'GEL', name: 'Georgian lari' },
  { code: 'GHS', name: 'Ghanaian cedi' },
  { code: 'GMD', name: 'Gambian dalasi' },
  { code: 'GNF', name: 'Guinean franc' },
  { code: 'GTQ', name: 'Guatemalan quetzal' },
  { code: 'GYD', name: 'Guyanese dollar' },
  { code: 'HNL', name: 'Honduran lempira' },
  { code: 'HTG', name: 'Haitian gourde' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'ILS', name: 'Israeli shekel' },
  { code: 'ISK', name: 'Icelandic króna' },
  { code: 'JMD', name: 'Jamaican dollar' },
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'KGS', name: 'Kyrgyzstani som' },
  { code: 'KHR', name: 'Cambodian riel' },
  { code: 'KWD', name: 'Kuwaiti dinar' },
  { code: 'KYD', name: 'Cayman Islands dollar' },
  { code: 'LAK', name: 'Lao kip' },
  { code: 'LKR', name: 'Sri Lankan rupee' },
  { code: 'LSL', name: 'Lesotho loti' },
  { code: 'MAD', name: 'Moroccan dirham' },
  { code: 'MNT', name: 'Mongolian tugrik' },
  { code: 'MOP', name: 'Macanese pataca' },
  { code: 'MUR', name: 'Mauritian rupee' },
  { code: 'MVR', name: 'Maldivian rufiyaa' },
  { code: 'MWK', name: 'Malawian kwacha' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'MZN', name: 'Mozambican metical' },
  { code: 'NAD', name: 'Namibian dollar' },
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'NIO', name: 'Nicaraguan córdoba' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'NPR', name: 'Nepalese rupee' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'OMR', name: 'Omani rial' },
  { code: 'PEN', name: 'Peruvian sol' },
  { code: 'PGK', name: 'Papua New Guinean kina' },
  { code: 'PKR', name: 'Pakistani rupee' },
  { code: 'PLN', name: 'Polish zloty' },
  { code: 'PYG', name: 'Paraguay guarani' },
  { code: 'QAR', name: 'Qatari riyal' },
  { code: 'RON', name: 'Romanian leu' },
  { code: 'RSD', name: 'Serbian dinar' },
  { code: 'RWF', name: 'Rwandan franc' },
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'SBD', name: 'Solomon Islands dollar' },
  { code: 'SCR', name: 'Seychellois rupee' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'SRD', name: 'Surinamese dollar' },
  { code: 'TND', name: 'Tunisian dinar' },
  { code: 'TOP', name: 'Tongan paʻanga' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'TTD', name: 'Trinidad and Tobago dollar' },
  { code: 'UAH', name: 'Ukrainian hryvnia' },
  { code: 'UYU', name: 'Uruguayan peso' },
  { code: 'VUV', name: 'Vanuatu vatu' },
  { code: 'WST', name: 'Samoan tala' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'ZMW', name: 'Zambian kwacha' },
]

const PAYOUT_CURRENCY_CODES = new Set(PAYOUT_CURRENCIES.map((c) => c.code))

export function isPayoutCurrency(code: string): boolean {
  return PAYOUT_CURRENCY_CODES.has(code.toUpperCase())
}

const COUNTRY_CODES = new Set(PAYOUT_COUNTRIES.map((c) => c.code))

export function isPayoutCountry(code: string): boolean {
  return COUNTRY_CODES.has(code.toUpperCase())
}

/**
 * Thai banks, with the SWIFT code each one uses.
 *
 * Only Thailand gets a list. Almost every teacher banks here, the set is small
 * and barely changes, and picking from it fills in the SWIFT code — which is
 * eight characters of nothing-in-particular and the single most mistyped field
 * on the form. Everywhere else the bank is typed, because a list that is
 * missing somebody's bank stops them being paid.
 */
export const THAI_BANKS: { swift: string; name: { en: string; th: string } }[] = [
  { swift: 'BKKBTHBK', name: { en: 'Bangkok Bank', th: 'ธนาคารกรุงเทพ' } },
  { swift: 'KASITHBK', name: { en: 'Kasikornbank', th: 'ธนาคารกสิกรไทย' } },
  { swift: 'KRTHTHBK', name: { en: 'Krungthai Bank', th: 'ธนาคารกรุงไทย' } },
  { swift: 'SICOTHBK', name: { en: 'Siam Commercial Bank', th: 'ธนาคารไทยพาณิชย์' } },
  { swift: 'AYUDTHBK', name: { en: 'Bank of Ayudhya (Krungsri)', th: 'ธนาคารกรุงศรีอยุธยา' } },
  { swift: 'TMBKTHBK', name: { en: 'TTB Bank', th: 'ธนาคารทีเอ็มบีธนชาต' } },
  { swift: 'UBOBTHBK', name: { en: 'United Overseas Bank (Thai)', th: 'ธนาคารยูโอบี' } },
  { swift: 'KIFITHB1', name: { en: 'Kiatnakin Phatra Bank', th: 'ธนาคารเกียรตินาคินภัทร' } },
  { swift: 'THBKTHBK', name: { en: 'CIMB Thai Bank', th: 'ธนาคารซีไอเอ็มบี ไทย' } },
  { swift: 'GSBATHBK', name: { en: 'Government Savings Bank', th: 'ธนาคารออมสิน' } },
  { swift: 'BAABTHBK', name: { en: 'Bank for Agriculture (BAAC)', th: 'ธนาคารเพื่อการเกษตร (ธ.ก.ส.)' } },
  { swift: 'GOHUTHB1', name: { en: 'Government Housing Bank', th: 'ธนาคารอาคารสงเคราะห์' } },
  { swift: 'LAHRTHB2', name: { en: 'Land and Houses Bank', th: 'ธนาคารแลนด์ แอนด์ เฮ้าส์' } },
  { swift: 'TIBTTHBK', name: { en: 'Thai Credit Bank', th: 'ธนาคารไทยเครดิต' } },
  { swift: 'ICBKTHBK', name: { en: 'ICBC (Thai)', th: 'ธนาคารไอซีบีซี (ไทย)' } },
  { swift: 'SMBCTHBK', name: { en: 'Sumitomo Mitsui (Thai)', th: 'ธนาคารซูมิโตโม มิตซุย' } },
]

/**
 * The shape of a SWIFT/BIC code.
 *
 * Four letters for the bank, two for the country, two for the place, and
 * optionally three more for a branch. Checked as a shape rather than against a
 * register: there is no free list of every valid code, and refusing a real one
 * because it is not in our copy would stop a payment for no reason. This
 * catches the mistakes people actually make — a digit where a letter goes, a
 * code of the wrong length, a bank name typed into the wrong box.
 */
const BIC = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

export function isSwift(code: string): boolean {
  return BIC.test(code.toUpperCase())
}

/** The country a SWIFT code says it belongs to — characters five and six. */
export function countryOfSwift(code: string): string | null {
  return isSwift(code) ? code.toUpperCase().slice(4, 6) : null
}
