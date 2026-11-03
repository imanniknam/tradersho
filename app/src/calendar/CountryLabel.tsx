const names:Record<string,string>={US:'آمریکا',EU:'منطقهٔ یورو',GB:'بریتانیا',CA:'کانادا',AU:'استرالیا',NZ:'نیوزیلند',JP:'ژاپن',ES:'اسپانیا',CH:'سوئیس',CN:'چین',SE:'سوئد',NO:'نروژ',ZA:'آفریقای جنوبی',TR:'ترکیه',MX:'مکزیک',IN:'هند',BR:'برزیل',KR:'کرهٔ جنوبی',SG:'سنگاپور',HK:'هنگ‌کنگ'}
export default function CountryLabel({country,currency,compact=false}:{country?:string;currency:string;compact?:boolean}){
 const name=country?names[country]||country:currency
 const flag=country&&/^[A-Z]{2}$/.test(country)?Array.from(country,c=>String.fromCodePoint(127397+c.charCodeAt(0))).join(''):null
 return <span className={'event-country'+(compact?' event-country-compact':'')} title={name}>{flag&&<span className="country-flag" role="img" aria-label={name}>{flag}</span>}<bdi dir="ltr" className="event-currency">{currency}</bdi>{!compact&&<span className="country-name">{name}</span>}</span>
}
