import {
  fromRestaurantDraft,
  restaurantDraftSchema,
  toRestaurantDraft,
  type RestaurantDraft,
  type RestaurantSiteDraft,
} from "@/lib/restaurant";

const lePetitMeunier: RestaurantSiteDraft = fromRestaurantDraft(
  restaurantDraftSchema.parse({
  slug: "le-petit-meunier",
  name: "Le Petit Meunier",
  eyebrow: "Cuisine de saison · Messimy",
  description:
    "À Messimy, Le Petit Meunier marie tradition française et cuisine gastronomique dans une maison chaleureuse, avec des produits de saison et des menus qui évoluent au fil du marché.",
  cuisine: "Cuisine française gastronomique",
  address: "12 chemin des Moulins, 69510 Messimy",
  phone: "04 78 45 05 03",
  sourceUrl: "https://www.lepetitmeunier.com/",
  heroImageUrl: "https://www.lepetitmeunier.com/s/img/emotionheader.JPG",
  heroOriginalImageUrl:
    "https://www.lepetitmeunier.com/s/img/emotionheader.JPG",
  heroImageProvenance: "official",
  palette: {
    background: "#f4f0e6",
    foreground: "#1f2923",
    accent: "#9a4f32",
  },
  showMenuImages: false,
  autoEnhanceImages: true,
  defaultLocale: "fr",
  translations: [
    {
      locale: "en",
      cuisine: "French fine dining",
      eyebrow: "Seasonal cuisine · Messimy",
      description:
        "In Messimy, Le Petit Meunier brings French tradition and fine dining together in a warm setting, with seasonal produce and menus shaped by the market.",
      menuSections: [
        {
          name: "Daily set menus",
          description: "Served Tuesday to Friday at lunchtime",
          items: [
            {
              name: "Complete set menu",
              description:
                "Starter, main course, dessert, house aperitif and a quarter-bottle of wine",
              dietaryLabels: [],
            },
            {
              name: "Menu of the day",
              description: "Starter, main course and dessert",
              dietaryLabels: [],
            },
            {
              name: "Two-course set menu",
              description:
                "Starter and main course, or main course and dessert",
              dietaryLabels: [],
            },
            {
              name: "Dish of the day",
              description: "The chef’s market-led suggestion",
              dietaryLabels: [],
            },
          ],
        },
        {
          name: "Starters",
          description:
            "À la carte in the evening, at weekends and on public holidays",
          items: [
            {
              name: "Parmesan panna cotta",
              description: "Pulled beef cheek and rocket",
              dietaryLabels: [],
            },
            {
              name: "Aubergine and ricotta roll",
              description: "Red pepper cream and crumble",
              dietaryLabels: ["vegetarian"],
            },
            {
              name: "Veal tataki",
              description:
                "Artichoke, confit tomato caviar and crispy capers",
              dietaryLabels: [],
            },
            {
              name: "Semi-cooked duck foie gras terrine",
              description:
                "Smoked duck breast, pumpkin seed bread and rhubarb chutney",
              dietaryLabels: [],
            },
            {
              name: "Tuna tartare",
              description:
                "Radish, avocado and a light passion fruit vinaigrette",
              dietaryLabels: [],
            },
          ],
        },
        {
          name: "Main courses",
          description: "Market cooking and seasonal produce",
          items: [
            {
              name: "Red lentil curry",
              description: "Asparagus, morels and courgette espuma",
              dietaryLabels: ["vegetarian"],
            },
            {
              name: "Sesame salmon tataki",
              description: "Japanese rice cake and pea cream",
              dietaryLabels: [],
            },
            {
              name: "Grilled king prawns",
              description:
                "Saffron arancini, vegetables and garlic carrot coulis",
              dietaryLabels: [],
            },
            {
              name: "Pan-seared veal sweetbread",
              description:
                "Baby potatoes, roasted sweet onion, young vegetables and rich jus",
              dietaryLabels: [],
            },
            {
              name: "Roast duck breast",
              description:
                "Dukkah spices, aubergine, panisse and reduced jus",
              dietaryLabels: [],
            },
            {
              name: "Wagyu sirloin",
              description:
                "100 g, paprika potatoes, asparagus, morel and Tiger Tear sauce",
              dietaryLabels: [],
            },
          ],
        },
        {
          name: "Desserts",
          description: "House creations · €9",
          items: [
            {
              name: "Milk chocolate tartlet",
              description: "Vanilla cream",
              dietaryLabels: [],
            },
            {
              name: "Strawberry pavlova",
              description: "Strawberry tartare and cocoa tuile",
              dietaryLabels: [],
            },
            {
              name: "Dark chocolate sphere",
              description:
                "Fresh pineapple, pineapple sorbet and salted caramel",
              dietaryLabels: [],
            },
            {
              name: "Reimagined Granny Smith apple",
              description: "Vanilla mousse and butter biscuit streusel",
              dietaryLabels: [],
            },
            {
              name: "Selection of house sorbets",
              description: "Five flavours selected according to the market",
              dietaryLabels: [],
            },
          ],
        },
      ],
      integrationLabels: ["Book a table", "View on Instagram"],
    },
  ],
  menuSections: [
    {
      name: "Formules du jour",
      description: "Servies du mardi au vendredi midi",
      items: [
        {
          name: "Menu complet",
          description: "Entrée, plat, dessert, apéritif maison et quart de vin",
          price: 32,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Menu du jour",
          description: "Entrée, plat et dessert",
          price: 25,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Formule deux services",
          description: "Entrée et plat, ou plat et dessert",
          price: 22,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Plat du jour",
          description: "La suggestion du chef selon le marché",
          price: 17,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
    {
      name: "Entrées",
      description: "À la carte le soir, le week-end et les jours fériés",
      items: [
        {
          name: "Panna cotta de parmesan",
          description: "Effiloché de joue de bœuf, roquette",
          price: 16,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Roulé d’aubergine et ricotta",
          description: "Crémeux de poivron rouge, crumble",
          price: 16,
          currency: "EUR",
          dietaryLabels: ["vegetarian"],
          imageUrl: null,
        },
        {
          name: "Tataki de veau",
          description:
            "Artichaut, caviar de tomate confite, câpres croustillantes",
          price: 20,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Terrine de foie gras de canard mi-cuit",
          description:
            "Magret fumé, pain aux graines de courge, chutney de rhubarbe",
          price: 20,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Tartare de thon",
          description:
            "Radis, avocat, vinaigrette légère aux fruits de la passion",
          price: 20,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
    {
      name: "Plats",
      description: "Cuisine du marché et produits de saison",
      items: [
        {
          name: "Curry de lentilles corail",
          description: "Asperges, morilles, espuma de courgette",
          price: 22,
          currency: "EUR",
          dietaryLabels: ["vegetarian"],
          imageUrl: null,
        },
        {
          name: "Tataki de saumon au sésame",
          description: "Galette de riz japonais, crème de petits pois",
          price: 22,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Gambas grillées",
          description:
            "Arancini au safran, légumes, coulis de carotte à l’ail",
          price: 27,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Cœur de ris de veau poêlé",
          description:
            "Pommes grenailles, oignon doux rôti, petits légumes, jus corsé",
          price: 27,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Magret de canard rôti",
          description: "Épices Dukkah, aubergine, panisse, jus réduit",
          price: 27,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Faux-filet de Wagyu",
          description:
            "100 g, pommes de terre au paprika, asperge, morille, sauce Larme du Tigre",
          price: 45,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
    {
      name: "Desserts",
      description: "Créations maison · 9 €",
      items: [
        {
          name: "Tartelette au chocolat au lait",
          description: "Crémeux vanille",
          price: 9,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Pavlova aux fraises",
          description: "Tartare de fraise, tuile cacao",
          price: 9,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Sphère en chocolat noir",
          description:
            "Ananas frais, sorbet ananas, caramel à la fleur de sel",
          price: 9,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Pomme Granny Smith revisitée",
          description: "Mousse vanille, streusel petit beurre",
          price: 9,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Assiette de sorbets maison",
          description: "Cinq parfums suivant le marché",
          price: 9,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
  ],
  integrations: [
    {
      type: "booking",
      label: "Réserver une table",
      provider: "Zenchef",
      url: "https://bookings.zenchef.com/results?rid=363961&lang=fr",
    },
    {
      type: "social",
      label: "Voir sur Instagram",
      provider: "Instagram",
      url: "https://www.instagram.com/lepetitmeunier/",
    },
  ],
  }),
);


const servizo: RestaurantSiteDraft = fromRestaurantDraft(
  restaurantDraftSchema.parse({
  slug: "servizo",
  name: "Servizo",
  eyebrow: "Guest-call systems · Hospitality",
  description:
    "Servizo builds wireless guest-call and paging systems for hotels, restaurants, beach clubs, yachts and casinos — buttons at every table or lounger, receivers on every wrist, no Wi-Fi and no monthly software fees.",
  cuisine: "Hospitality service systems",
  address: "Malta · Mauritius",
  phone: "",
  sourceUrl: "https://www.servizo.com/",
  heroImageUrl:
    "https://www.servizo.com/wp-content/uploads/slider/cache/8ef3db6c7850d35c204deecfd67fb879/IMG_32081.jpg",
  heroOriginalImageUrl:
    "https://www.servizo.com/wp-content/uploads/slider/cache/8ef3db6c7850d35c204deecfd67fb879/IMG_32081.jpg",
  heroImageProvenance: "official",
  palette: {
    background: "#f4f1ec",
    foreground: "#14181f",
    accent: "#b85a2f",
  },
  showMenuImages: false,
  autoEnhanceImages: true,
  defaultLocale: "en",
  translations: [],
  menuSections: [
    {
      name: "Call buttons",
      description: "Discreet transmitters for tables, loungers, cabins and gaming floors",
      items: [
        {
          name: "Servizo Bell SE5",
          description: "Signature indoor call button — 50 m+ range, ~10,000 calls per charge",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Servizo Premium Bell SE7",
          description: "Waterproof, UV-resistant outdoor calling with LED alert and night base flash",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Beach Club SE30B",
          description: "Per-umbrella calling with colour-coded location ID and anti-theft protection",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
    {
      name: "Receivers",
      description: "Wrist and staff receivers that route every press to the right person",
      items: [
        {
          name: "Watch Receiver SE201",
          description: "Flagship receiver for large and outdoor venues — up to 2,000 call points, IP67",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
    {
      name: "Solutions",
      description: "One platform tailored to how the venue serves",
      items: [
        {
          name: "Hotels & resorts",
          description: "Estate-wide guest reach and room-ready notification without guest apps",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Restaurants & bars",
          description: "Table-side calling that removes dead time between ready and noticed",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Beach & pool clubs",
          description: "Lounger-precise service across sprawling outdoor floors",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
        {
          name: "Yachts & casinos",
          description: "Marine-ready and floor-calm calling for cabins, decks and VIP rooms",
          price: null,
          currency: "EUR",
          dietaryLabels: [],
          imageUrl: null,
        },
      ],
    },
  ],
  integrations: [
    {
      type: "ordering",
      label: "Open Servizo Pulse",
      provider: null,
      url: "https://appservizocom.vercel.app/",
    },
    {
      type: "booking",
      label: "Start a free trial",
      provider: null,
      url: "https://servizocom.vercel.app/",
    },
  ],
  }),
);

export const leadSiteDrafts: Record<string, RestaurantSiteDraft> = {
  [lePetitMeunier.slug]: lePetitMeunier,
  "restaurant-le-petit-meunier": lePetitMeunier,
  [servizo.slug]: servizo,
};

export const leadDrafts: Record<string, RestaurantDraft> = Object.fromEntries(
  Object.entries(leadSiteDrafts).map(([slug, draft]) => [
    slug,
    toRestaurantDraft(draft),
  ]),
);
