export const SOWIND_COUNTRY_VALUES = new Set(`
Afghanistan
Greece
Norway
Albania
Greenland
Oman
Algeria
Grenada
Pakistan
American Samoa
Guadeloupe
Palau
Andorra
Guatemala
Palestine
Angola
Guernsey
Panama
Antigua & Deps
Guinea
Papua New Guinea
Argentina
Guinea-Bissau
Paraguay
Armenia
Guyana
Peru
Aruba
Haiti
Philippines
Australia
Honduras
Poland
Austria
Hong Kong
Portugal
Azerbaijan
Hungary
Puerto Rico
Bahamas
Iceland
Qatar
Bahrain
India
Romania
Bangladesh
Indonesia
Russian Federation
Barbados
Iran
Rwanda
Belarus
Iraq
Saint Barthelemy
Belgium
Ireland {Republic}
Saint Kitts and Nevis
Belize
Isle of Man
Saint Pierre and Miquelon
Benin
Israel
Saint Vincent & the Grenadines
Bermuda
Italy
Samoa
Bhutan
Ivory Coast
San Marino
Bolivia
Jamaica
Sao Tome & Principe
Bosnia Herzegovina
Japan
Saudi Arabia
Botswana
Jersey
Senegal
Brazil
Jordan
Serbia
British Virgin Islands
Kazakhstan
Seychelles
Brunei
Kenya
Sierra Leone
Bulgaria
Kiribati
Singapore
Burkina
Korea North
Sint Maarten
Burundi
Korea South
Slovakia
Cambodia
Kosovo
Slovenia
Cameroon
Kuwait
Solomon Islands
Canada
Kyrgyzstan
Somalia
Cape Verde
Laos
South Africa
Caribbean Netherlands
Latvia
South Sudan
Cayman Islands
Lebanon
Spain
Central African Rep
Lesotho
Sri Lanka
Chad
Liberia
St Kitts & Nevis
Chile
Libya
St Lucia
China
Liechtenstein
Sudan
Colombia
Lithuania
Suriname
Comoros
Luxembourg
Swaziland
Congo
Macau
Sweden
Congo {Democratic Rep}
Macedonia
Switzerland
Costa Rica
Madagascar
Syria
Croatia
Malawi
Taiwan
Cuba
Malaysia
Tajikistan
Curaçao
Maldives
Tanzania
Cyprus
Mali
Thailand
Czech Republic
Malta
Togo
Denmark
Marshall Islands
Tonga
Djibouti
Martinique
Trinidad & Tobago
Dominica
Mauritania
Tunisia
Dominican Republic
Mauritius
Turkey
East Timor
Mexico
Turkmenistan
Ecuador
Micronesia
Tuvalu
Egypt
Moldova
Uganda
El Salvador
Monaco
Ukraine
Equatorial Guinea
Mongolia
United Arab Emirates
Eritrea
Montenegro
United Kingdom
Estonia
Morocco
United States
Ethiopia
Mozambique
Uruguay
Fiji
Myanmar, (Burma)
Uzbekistan
Finland
Namibia
Vanuatu
France
Nauru
Vatican City
Gabon
Nepal
Venezuela
Gambia
Netherlands
Viet Nam
Georgia
New Zealand
Virgin Islands, U.S.
Germany
Nicaragua
Yemen
Ghana
Niger
Zambia
Gibraltar
Nigeria
Zimbabwe
`.trim().split("\n"));

export const COUNTRY_ALIASES: Record<string, string> = {
  "中国大陆": "China",
  "中国香港": "Hong Kong",
  "中国澳门": "Macau",
  "中国台湾": "Taiwan",
  "Chinese Mainland": "China",
  "Hong Kong SAR": "Hong Kong",
  "Macau SAR": "Macau",
  "Taiwan Region": "Taiwan",
};
