/** Menu item ids from fixtures/luigis.menu.json (prod snapshot 2026-08-15).
 *  `scenarios.test.ts` fails loudly if any of these leaves the fixture. */
export const L = {
  restaurant: "luigis",
  // size-as-the-item pizzas (no variants; presets none; topping allowance = N)
  small1: "cmpuex5xk0ab004kvxca09zpe",
  medium1: "cmpuex5ql09vs04kv9qjq6z6y",
  medium2: "cmre74uv4000d04jomjvjpwcv",
  large1: "cmpuex5ze0aet04kvpjtep8fd",
  large2: "cmpuex5s909zl04kvsueiyrqf",
  large3: "cmpuex5vp0a7704kve0ywsxp7",
  large5: "cmpuex6140aim04kvz7m7ek62",
  xl1: "cmpuex5tx0a3e04kvc4zajum6",
  xl2: "cmpuex62r0amf04kv76tscwz1",
  xl3: "cmre6yz83000504l1eswda9a6",
  // specialty pizzas (variants Small/Medium/Large/X Large; presets)
  hawaiian: "cmpuex5fl098604kvtaehpc6l", // presets Pepperoni, Pineapple
  meatLovers: "cmpuex4fh079c04kvbyftb6xs", // presets Pepperoni, Ground Beef, Chicken (sizes Small/Medium/Large/XL)
  vegetable: "cmpuex4r607wy04kvqvxsjhaz", // presets Mushrooms, Green Peppers, Tomatoes
  chipotleChicken: "cmpuex3ys069x04kvn9dpsha0", // presets Chicken, Cheddar Cheese, Mushrooms, Red Peppers, Red Onion
  buildYourOwn: "cmpuex2dk036j04kvels3yb6l",
  // combos
  doubleLarge: "cmpuex1tu029i04kv20g87o7v", // 1st Large Pizza / 2nd Large Pizza (Large 3 Topping) + Dipping Sauces ×2; shared 6 toppings
  familyFeast: "cmpuex23w02r304kv5u4d9zcd", // X Large Pizza (XL 1 Topping) + 20 Chicken Wings + Choose 4 Pop + Choose 2 Dip
  largeWings: "cmpuex1ie01rj04kvf6toxs1j", // Pizza (Large 3 Topping) + Chicken Wings
  twoCanDine: "cmpuex27902wk04kvneht7py9", // Medium 2 Topping + 10 wings + 2 pop + 1 cake
  // simple items
  wings: "cmpuex6kl0ay804kvuo7b8w4d", // variants 10/20/30/40; required "How would you like them?" (Hot Mixed, Mild Mixed, HG Mixed, BBQ Mixed, … On Side)
  dip: "cmpuex6p00b0h04kvnujagdrb", // required Choose Dip: Garlic, Ranch, Chipotle, BBQ, Marinara, Blue Cheese, …
  pop: "cmpuex6pw0b1504kvk0i8tyv6", // required Pop: Coke, Pepsi, Diet Coke, Sprite, Ginger ale, …
  lasagna: "cmqog1akv0arw04iehis19rkb", // Beef Lasagna Regular/Large
  garlicBread: "cmpuex6m30azl04kv7xua0mhg", // Add Ons optional
  garlicBreadCheese: "cmpuex6mg0azq04kvuw38zssm",
  caesar: "cmpuex6tv0b3304kveip69vir", // required dressing
  fries: "cmpuex6nd0b0104kvpsf3cdky", // Small/Large
  poutine: "cmpuex6mr0azv04kv41dfm7ui", // Small/Large
  waterBottle: "cmpuex6qz0b2a04kv1big6u8d",
  lavaCake: "cmpuex6sf0b2r04kv9mu8t6rx",
  smashBurger: "cmpuex6cu0au104kv2r8zpa1e",
  giftCard: "cmpuex11q01ai04kvu0mvtzf0",
  redVelvet: "cmpuex6tb0b2y04kv4axzwbs1",
} as const;

export const ADDR = { street: "123 Main St", city: "Milton", zip: "L9T 2J3" };
