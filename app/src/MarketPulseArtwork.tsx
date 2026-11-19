import type {Ref} from 'react'

export default function MarketPulseArtwork({artworkRef}:{artworkRef:Ref<SVGSVGElement>}) {
  return <svg ref={artworkRef} className="market-pulse-art" viewBox="0 0 1200 600" direction="ltr" focusable="false">
    <defs>
      <radialGradient id="mp-amb">
        <stop stopColor="#554572" stopOpacity=".28"/>
        <stop offset="1" stopColor="#17181c" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="mp-card" x2=".8" y2="1">
        <stop stopColor="#2a2a35"/>
        <stop offset="1" stopColor="#1c1d24"/>
      </linearGradient>
      <linearGradient id="mp-expert" x2=".8" y2="1">
        <stop stopColor="#30303d"/>
        <stop offset="1" stopColor="#20212b"/>
      </linearGradient>
      <linearGradient id="mp-edge" x2="1" y2="1">
        <stop stopColor="#6f638c"/>
        <stop offset=".5" stopColor="#393843"/>
        <stop offset="1" stopColor="#31333d"/>
      </linearGradient>
      <linearGradient id="mp-area" x2="0" y2="1">
        <stop stopColor="#b8a1f2" stopOpacity=".12"/>
        <stop offset="1" stopColor="#b8a1f2" stopOpacity="0"/>
      </linearGradient>
      <radialGradient id="mp-dial">
        <stop stopColor="#393244"/>
        <stop offset="1" stopColor="#23232c"/>
      </radialGradient>
      <clipPath id="mp-chart-clip">
        <rect x="335" y="102" width="398" height="265" rx="8"/>
      </clipPath>
    </defs>
    <ellipse cx="540" cy="300" rx="570" ry="275" fill="url(#mp-amb)"/>
    <g opacity=".12" fill="none" stroke="#a995cf">
      <ellipse cx="599" cy="305" rx="498" ry="216" strokeDasharray="2 10"/>
      <path d="M112 312H1113" strokeDasharray="2 11"/>
    </g>
    {/* MetaTrader chart and its animated price levels. */}
    <rect x="142" y="81" width="653" height="357" rx="18" fill="#101115" opacity=".55"/>
    <rect x="134" y="71" width="653" height="357" rx="18" fill="url(#mp-card)" stroke="url(#mp-edge)"/>
    <path d="M135 113H786" stroke="#3b3946"/>
    <circle cx="157" cy="93" r="3" fill="#6e637d"/>
    <circle cx="169" cy="93" r="3" fill="#57515e"/>
    <circle cx="181" cy="93" r="3" fill="#44434c"/>
    <text x="206" y="98" fill="#9b98aa" fontSize="11">MetaTrader</text>
    <text x="743" y="98" textAnchor="end" fill="#ddd7ec" fontSize="11" letterSpacing="1">XAUUSD</text>
    <g clipPath="url(#mp-chart-clip)">
      <g stroke="#363540" strokeWidth=".65" opacity=".65">
        <path d="M345 125V373"/>
        <path d="M387 125V373"/>
        <path d="M429 125V373"/>
        <path d="M471 125V373"/>
        <path d="M513 125V373"/>
        <path d="M555 125V373"/>
        <path d="M597 125V373"/>
        <path d="M639 125V373"/>
        <path d="M681 125V373"/>
        <path d="M723 125V373"/>
        <path d="M335 134H740"/>
        <path d="M335 176H740"/>
        <path d="M335 218H740"/>
        <path d="M335 260H740"/>
        <path d="M335 302H740"/>
        <path d="M335 344H740"/>
      </g>
      <g transform="translate(0,60)">
        <g opacity="0.420">
          <path d="M352 232V280" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="347.5" y="240" width="9" height="25" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.445">
          <path d="M375 233V271" stroke="#697181" strokeWidth="1.4"/>
          <rect x="370.5" y="242" width="9" height="15" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.470">
          <path d="M398 214V269" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="393.5" y="225" width="9" height="33" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.495">
          <path d="M421 211V249" stroke="#697181" strokeWidth="1.4"/>
          <rect x="416.5" y="225" width="9" height="11" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.520">
          <path d="M444 201V248" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="439.5" y="210" width="9" height="27" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.545">
          <path d="M467 202V241" stroke="#697181" strokeWidth="1.4"/>
          <rect x="462.5" y="210" width="9" height="18" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.570">
          <path d="M490 181V237" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="485.5" y="191" width="9" height="37" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.595">
          <path d="M513 182V218" stroke="#697181" strokeWidth="1.4"/>
          <rect x="508.5" y="191" width="9" height="12" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.620">
          <path d="M536 163V215" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="531.5" y="174" width="9" height="29" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.645">
          <path d="M559 165V198" stroke="#697181" strokeWidth="1.4"/>
          <rect x="554.5" y="174" width="9" height="9" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.670">
          <path d="M582 142V193" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="577.5" y="153" width="9" height="30" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.695">
          <path d="M605 145V184" stroke="#697181" strokeWidth="1.4"/>
          <rect x="600.5" y="153" width="9" height="18" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.720">
          <path d="M628 132V183" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="623.5" y="145" width="9" height="27" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.745">
          <path d="M651 135V170" stroke="#697181" strokeWidth="1.4"/>
          <rect x="646.5" y="145" width="9" height="11" rx="1.5" fill="#697181"/>
        </g>
        <g opacity="0.770">
          <path d="M674 114V166" stroke="#b6a9e3" strokeWidth="1.4"/>
          <rect x="669.5" y="126" width="9" height="30" rx="1.5" fill="#b6a9e3"/>
        </g>
        <g opacity="0.795">
          <path d="M697 116V150" stroke="#697181" strokeWidth="1.4"/>
          <rect x="692.5" y="126" width="9" height="11" rx="1.5" fill="#697181"/>
        </g>
      </g>
      <path d="M346 326C376 316 396 329 423 304S464 302 488 275S528 281 553 251S592 265 621 230S669 232 708 199" fill="none" stroke="#c6b5ec" strokeWidth="1.5" opacity=".35"/>
      <g id="mp-trade-lines" opacity="0.18">
        <rect id="mp-profit-zone" x="342" y="191" width="0.00" height="94" fill="#aaa0cf" opacity=".065"/>
        <rect id="mp-loss-zone" x="342" y="285" width="0.00" height="56.00" fill="#c18a9e" opacity=".06"/>
        <path id="mp-tp-line" d="M342 191H342.00" stroke="#a799cb" strokeWidth="1.2" strokeDasharray="4 4"/>
        <path id="mp-entry-line" d="M342 285H342.00" stroke="#9dabc3" strokeWidth="1.2" strokeDasharray="4 4"/>
        <path id="mp-sl-line" d="M342 341.00H342.00" stroke="#b8879b" strokeWidth="1.2" strokeDasharray="4 4"/>
      </g>
    </g>
    <g id="mp-line-tags" opacity="0">
      <rect x="717" y="181" width="43" height="20" rx="5" fill="#463c59"/>
      <text x="738.5" y="195" textAnchor="middle" fontSize="9" fill="#d8c6f5">TP</text>
      <g id="mp-entry-tag">
        <rect x="703" y="275" width="57" height="20" rx="5" fill="#343d4e"/>
        <text x="731.5" y="289" textAnchor="middle" fontSize="8" fill="#c5d0e4">ENTRY</text>
      </g>
      <g id="mp-sl-tag" transform="translate(0,0.00)">
        <rect id="mp-sl-tag-bg" x="717" y="331" width="43" height="20" rx="5" fill="#4b3541"/>
        <text id="mp-sl-label" x="738.5" y="345" textAnchor="middle" fontSize="9" fill="#dfb9c8">SL</text>
      </g>
    </g>
    <text x="355" y="405" fill="#676574" fontSize="9" letterSpacing="1.4">MONEY MANAGEMENT / METATRADER</text>
    {/* Expert Money Manager controls. */}
    <rect x="85" y="177" width="250" height="331" rx="17" fill="#0d0e12" opacity=".5"/>
    <rect x="77" y="166" width="250" height="331" rx="17" fill="url(#mp-expert)" stroke="#75658d" strokeOpacity=".75"/>
    <rect x="78" y="167" width="248" height="47" rx="16" fill="#393244"/>
    <path d="M78 200V214H326V200" fill="#393244"/>
    <text x="95" y="190" fill="#ece7f5" fontSize="12" fontWeight="bold">Tradersho</text>
    <text x="95" y="205" fill="#b2a5c5" fontSize="7.5" letterSpacing="1.8">MONEY MANAGER</text>
    <rect x="273" y="182" width="36" height="19" rx="5" fill="#514461"/>
    <text x="291" y="195" textAnchor="middle" fontSize="9" fill="#ddd1f0">MT5</text>
    <g id="mp-expert-tabs" textAnchor="middle" fontSize="8.5" letterSpacing=".15">
      <text x="132" y="237" fill="#ddd4ed">SETUP</text>
      <text x="202" y="237" fill="#888592">PORTFOLIO</text>
      <text x="272" y="237" fill="#888592">MANAGE</text>
    </g>
    <path d="M108 247H156" stroke="#b5a0da" strokeWidth="2"/>
    <path d="M98 253H307" stroke="#41404b"/>
    <text x="99" y="277" fill="#aaa4b5" fontSize="10">Risk</text>
    <rect x="202" y="262" width="104" height="27" rx="6" fill="#1d1e26" stroke="#4b455b"/>
    <text id="mp-expert-risk-value" x="254" y="280" textAnchor="middle" fontSize="12" fill="#ede7f7">0.50 %</text>
    <text x="99" y="316" fill="#aaa4b5" fontSize="10">Volume</text>
    <rect x="202" y="300" width="104" height="27" rx="6" fill="#1d1e26" stroke="#4b455b"/>
    <text x="254" y="318" textAnchor="middle" fontSize="12" fill="#ede7f7">0.24 lot</text>
    <text x="99" y="355" fill="#aaa4b5" fontSize="10">Risk / Reward</text>
    <text x="304" y="355" textAnchor="end" fontSize="13" fill="#c6b5e6">1 : 3</text>
    <path d="M98 373H307" stroke="#41404b"/>
    <circle id="mp-be-light" cx="105" cy="394" r="3" fill="#a4c3b2" opacity="0.3"/>
    <text x="116" y="398" fill="#9eaba6" fontSize="9">BREAK EVEN</text>
    <text x="305" y="398" textAnchor="end" fill="#8d8797" fontSize="8">AUTO</text>
    <rect x="97" y="422" width="100" height="34" rx="7" fill="#3b4b49" stroke="#596e66"/>
    <text x="147" y="444" textAnchor="middle" fill="#c3dacf" fontSize="11" fontWeight="bold">BUY</text>
    <rect x="206" y="422" width="100" height="34" rx="7" fill="#4b3946" stroke="#6e5265"/>
    <text x="256" y="444" textAnchor="middle" fill="#dec0d1" fontSize="11" fontWeight="bold">SELL</text>
    <text x="202" y="479" textAnchor="middle" fontSize="7" fill="#766e86" letterSpacing="1.5">TRADE WITH CONTROL</text>
    {/* Smart Risk Panel. */}
    <rect x="817" y="96" width="303" height="235" rx="18" fill="#101115" opacity=".45"/>
    <rect x="809" y="85" width="303" height="235" rx="18" fill="url(#mp-card)" stroke="url(#mp-edge)"/>
    <text x="835" y="115" fill="#e6deef" fontSize="12" fontWeight="bold">Smart Risk Panel</text>
    <g id="mp-risk-panel-logo" transform="translate(1058 97)">
      <rect width="34" height="34" rx="10" fill="#6661a6" stroke="#8a83c4" strokeWidth=".7"/>
      <g transform="translate(5 5)" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5C10.1 5.2 8.2 5.8 5.5 6.3V12.7C5.5 16.2 8.1 19.1 12 20.5C15.9 19.1 18.5 16.2 18.5 12.7V6.3C15.8 5.8 13.9 5.2 12 3.5Z"/>
        <path d="m9 11.7 2 2 4-4"/>
      </g>
    </g>
    <text x="1085" y="153" className="mp-fa" textAnchor="end" fontSize="12" fill="#aaa1b8">ریسک معامله فعلی</text>
    <text x="837" y="197" fill="#ede6f5" fontSize="31" fontWeight="bold">0.85<tspan fontSize="15" fill="#a396b9">{' '}%</tspan></text>
    <text x="1084" y="196" textAnchor="end" fill="#b8accb" fontSize="17">T3</text>
    <path d="M838 217H1084" stroke="#413b4c"/>
    <g>
      <rect x="840" y="233" width="32" height="30" rx="7" fill="#25262e" stroke="#383943"/>
      <text x="856" y="252" textAnchor="middle" fontSize="10" fill="#858493">T1</text>
      <rect x="879" y="233" width="32" height="30" rx="7" fill="#25262e" stroke="#383943"/>
      <text x="895" y="252" textAnchor="middle" fontSize="10" fill="#858493">T2</text>
      <rect x="918" y="233" width="32" height="30" rx="7" fill="#7664ac" stroke="#b9a6ea"/>
      <text x="934" y="252" textAnchor="middle" fontSize="10" fill="#ffffff">T3</text>
      <rect x="957" y="233" width="32" height="30" rx="7" fill="#25262e" stroke="#383943"/>
      <text x="973" y="252" textAnchor="middle" fontSize="10" fill="#858493">T4</text>
      <rect x="996" y="233" width="32" height="30" rx="7" fill="#25262e" stroke="#383943"/>
      <text x="1012" y="252" textAnchor="middle" fontSize="10" fill="#858493">T5</text>
      <rect x="1035" y="233" width="32" height="30" rx="7" fill="#25262e" stroke="#383943"/>
      <text x="1051" y="252" textAnchor="middle" fontSize="10" fill="#858493">T6</text>
    </g>
    <rect id="mp-step-glow" x="917" y="232" width="34" height="32" rx="8" fill="none" stroke="#cbb5fc" strokeWidth="1.5" opacity="0.500"/>
    <text x="1084" y="295" className="mp-fa" textAnchor="end" fontSize="10" fill="#9f98aa">برنامه مشخص برای هر مرحله</text>
    {/* Gold Compass. */}
    <rect x="636" y="369" width="476" height="154" rx="19" fill="#101115" opacity=".45"/>
    <rect x="628" y="358" width="476" height="154" rx="19" fill="url(#mp-card)" stroke="url(#mp-edge)"/>
    <circle cx="703" cy="434" r="53" fill="url(#mp-dial)" stroke="#645873"/>
    <circle cx="703" cy="434" r="44" fill="none" stroke="#494151" strokeDasharray="1 6"/>
    <path d="M703 388V393M703 475V480M657 434H662M744 434H749" stroke="#ab99c3" strokeWidth="1.3"/>
    <g id="mp-needle" transform="rotate(-18.00 703 434)">
      <path d="M703 402L714 441L703 434L692 441Z" fill="#c5b098"/>
      <path d="M703 466L692 427L703 434L714 427Z" fill="#675c75"/>
    </g>
    <circle cx="703" cy="434" r="5.5" fill="#d0bca8"/>
    <circle cx="703" cy="434" r="2" fill="#33303b"/>
    <text x="1074" y="396" textAnchor="end" fill="#efe7f2" fontSize="19" fontWeight="bold">Gold Compass</text>
    <text x="1074" y="421" className="mp-fa" fill="#9c8eaa" textAnchor="end" fontSize="11">قطب‌نمای طلا</text>
    <text x="1074" y="454" className="mp-fa" textAnchor="end" fill="#aaa0b5" fontSize="11">دلار</text>
    <text x="970" y="454" className="mp-fa" textAnchor="end" fill="#aaa0b5" fontSize="11">بازده اوراق</text>
    <text x="843" y="454" className="mp-fa" textAnchor="end" fill="#aaa0b5" fontSize="11">تورم</text>
    <rect x="1005" y="470" width="69" height="4" rx="2" fill="#403849"/>
    <rect id="mp-factor-dollar" x="1005" y="470" width="45.50" height="4" rx="2" fill="#ad99ca"/>
    <rect x="887" y="470" width="83" height="4" rx="2" fill="#403849"/>
    <rect id="mp-factor-yield" x="887" y="470" width="57.00" height="4" rx="2" fill="#88769f"/>
    <rect x="794" y="470" width="49" height="4" rx="2" fill="#403849"/>
    <rect id="mp-factor-risk" x="794" y="470" width="26.50" height="4" rx="2" fill="#b5a18c"/>
  </svg>
}
