const names:Record<string,string>={US:'آمریکا',EU:'منطقهٔ یورو',GB:'بریتانیا',CA:'کانادا',AU:'استرالیا',NZ:'نیوزیلند',JP:'ژاپن',ES:'اسپانیا',CH:'سوئیس',CN:'چین',SE:'سوئد',NO:'نروژ',ZA:'آفریقای جنوبی',TR:'ترکیه',MX:'مکزیک',IN:'هند',BR:'برزیل',KR:'کرهٔ جنوبی',SG:'سنگاپور',HK:'هنگ‌کنگ'}
export default function CountryLabel({country,currency,compact=false}:{country?:string;currency:string;compact?:boolean}){
 const name=country?names[country]||country:currency
 const flag=country&&names[country]?'/assets/flags/'+country.toLowerCase()+'.svg':null
 return <span className={'event-country'+(compact?' event-country-compact':'')} title={name}>{flag&&<img className="country-flag" src={flag} alt={name} width="22" height="16"/>}<bdi dir="ltr" className="event-currency">{currency}</bdi>{!compact&&<span className="country-name">{name}</span>}</span>
}
