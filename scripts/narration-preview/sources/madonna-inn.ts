/**
 * Madonna Inn — Tier 1 iconic landmark source description.
 *
 * Curator-calibrated ~550-word source description locked 2026-05-21.
 * Used by scripts/narration-preview/preview.ts for cadence-rewrite
 * synthesis through Claude Sonnet 4.6 → Google Chirp 3 HD TTS.
 */

export interface SourceRecord {
  id: string;
  name: string;
  category_display: string;
  source_citation: string;
  description: string;
}

export const MADONNA_INN_SOURCE: SourceRecord = {
  id: 'madonna-inn',
  name: 'Madonna Inn',
  category_display: 'Iconic Landmark',
  source_citation: 'curator-authored, 2026-05-21',
  description: `The Madonna Inn opened Christmas Eve, 1958, with twelve rooms. Alex Madonna, the construction magnate who built it, gave them away free that first night to the travelers who showed up — by his telling, the concrete hadn't set yet. By 1959 there were forty rooms; the main inn followed in 1960. Today the property spans 1,500 acres on the west side of Highway 101, on the lower flank of Cerro San Luis Obispo, with 110 individually themed rooms and the Madonna family still running it through Madonna Enterprises.

Alex Madonna built much of California's Central Coast — highway interchanges, bridges, original sections of California 46. He didn't hire an architect for the Inn; he designed it himself, with Phyllis, room by room. Phyllis later told the story: Alex hated bland motels. After years on the road, he decided to build the opposite — a hotel where every room was a deliberate choice. They bought ten acres at silent auction in 1954 and broke ground four years later.

The 110 rooms are named, not numbered. Caveman has rock walls, rock ceiling, rock floor, and a waterfall shower set into the boulders. Yahoo is a barnyard tableau in primary colors. Wigwam is a teepee-shaped fantasy. Love Nest, Just Heaven, Cloud Nine, Mini-Maxi, Anniversary, Irish Hills, Cabin Still — each a self-contained world. Materials came from Alex's own construction operation: granite boulders weighing up to two hundred tons from the San Luis Mountain directly behind the property, hand-carved Bavarian woodwork by an immigrant master named Alexander Zeller, hammered copper, gilded cupids. The Hearst family — neighbors up the coast at San Simeon — gifted a hand-carved white marble balustrade as a favor return.

The architectural vocabulary is a deliberate collision. The exterior is pseudo-Swiss Alps — steep roofs, dark timbered eaves — on California oak grassland with cattle visible on the back acres. The interior is Gold Rush Western: stone fireplaces, wagon-wheel chandeliers, leather and brass and antler. Pink unifies both: pink booths, pink carpets, pink lampposts, pink trash cans, pink uniforms. The signature dessert is Pink Champagne Cake. The men's room at the Alex Madonna Gold Rush Steakhouse has a motion-sensor waterfall urinal that visitors stop to photograph even when they're not staying overnight.

Critical reception has been bipolar for seven decades. Modernist architect Richard Neutra visited and was dismayed. Design critics have called it "a fantasy run amok" and "a Hansel-and-Gretel complex." Charles Phoenix, the Los Angeles humorist who chronicles mid-century Americana, describes it as "rural ranch-gone-castle" and "unapologetically original" — firing on so many cylinders of classic and kitschy American pop culture that it resonates with the creative class. John Wayne, Clint Eastwood, Dolly Parton, Debbie Harry have all stayed. For Central Coast parents whose kids attend Cal Poly San Luis Obispo, staying once is considered a rite of passage.

Alex Madonna died in April 2004. The Inn has modernized in small increments since then — quiet upgrades, new restaurant concepts, the Silver Bar Cocktail Lounge — while preserving every signature surface. The original twelve rooms still rent at premium rates. The family has never franchised and never replicated. There is only one Madonna Inn.`,
};
