import { BLOCKS, DEFAULT_THEME } from "./blocks";
import { newId, slugify } from "./site";
import type { Block, BlockProps, BlockType, Page, Site, Theme } from "./types";

/** Build a block, starting from its defaults and overriding what we care about. */
function b(type: BlockType, props: BlockProps = {}): Block {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    props: { ...BLOCKS[type].defaults(), ...props },
  };
}

function theme(overrides: Partial<Theme>): Theme {
  return { ...DEFAULT_THEME, ...overrides };
}

/** A page, with its slug derived from its name. */
function page(name: string, blocks: Block[]): Page {
  return { id: newId("page"), name, slug: slugify(name), blocks };
}

export type Template = {
  id: string;
  name: string;
  tagline: string;
  build: () => Site;
};

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    tagline: "Start from nothing and build it your way.",
    build: () => ({
      title: "My New Site",
      theme: theme({}),
      nav: true,
      pages: [page("Home", [])],
    }),
  },

  {
    id: "portfolio",
    name: "Portfolio",
    tagline: "Three pages: home, your work, and about you.",
    build: () => ({
      title: "My Portfolio",
      theme: theme({ accent: "#0ea5e9", bg: "#fbfbfd", font: "rounded", maxWidth: 820 }),
      nav: true,
      pages: [
        page("Home", [
          b("hero", {
            heading: "Hi, I'm Andrei \u{1F44B}",
            subheading: "I build websites, games and other things that live on the internet.",
            buttonText: "See my work",
            buttonLink: "#work",
            style: "gradient",
            align: "left",
          }),
          b("text", {
            text: "This is the front page. Keep it short \u2014 say who you are, then send people to the good stuff.",
            align: "left",
          }),
          b("button", { text: "About me", link: "#about", variant: "outline", align: "left" }),
        ]),
        page("Work", [
          b("heading", { text: "Things I've made", align: "left" }),
          b("features", {
            title: "",
            items: [
              { icon: "\u{1F6E0}", title: "Sitebuilder", body: "A visual editor that exports real HTML." },
              { icon: "\u{1F3AE}", title: "A small game", body: "Made in a weekend. Still fun." },
              { icon: "\u{1F4D3}", title: "Notes app", body: "Because every dev writes one eventually." },
            ],
          }),
          b("text", {
            text: "Add an image block under each project once you have screenshots.",
            align: "left",
          }),
        ]),
        page("About", [
          b("heading", { text: "About me", align: "left" }),
          b("text", {
            text: "Write a couple of sentences about yourself here \u2014 what you like making, what you're learning right now, and what you'd like to build next.\n\nPeople read this bit more than you'd expect.",
            align: "left",
          }),
          b("button", {
            text: "Email me",
            link: "mailto:you@example.com",
            variant: "outline",
            align: "left",
          }),
          b("footer", {
            text: "Built by me, with my own site builder.",
            links: [
              { label: "GitHub", href: "https://github.com" },
              { label: "Email", href: "mailto:you@example.com" },
            ],
          }),
        ]),
      ],
    }),
  },

  {
    id: "landing",
    name: "Product landing",
    tagline: "Pitch an app, a tool, or an idea.",
    build: () => ({
      title: "Launch Day",
      theme: theme({ accent: "#4f46e5", bg: "#ffffff", maxWidth: 900, radius: 16 }),
      nav: true,
      pages: [
        page("Home", [
          b("hero", {
            heading: "The fastest way to ship your idea",
            subheading:
              "One sentence that makes someone want to keep reading. Keep it short and concrete.",
            buttonText: "Try it free",
            buttonLink: "#",
            style: "tint",
            align: "center",
          }),
          b("features", {
            title: "Why people like it",
            items: [
              { icon: "\u26A1", title: "Fast", body: "Everything happens instantly, with no waiting around." },
              { icon: "\u{1F3A8}", title: "Good-looking", body: "Sensible design out of the box, nothing to tweak." },
              { icon: "\u{1F512}", title: "Private", body: "Your work stays yours. No accounts required." },
            ],
          }),
          b("image", {
            src: "https://picsum.photos/seed/product/1200/620",
            alt: "A screenshot of the product",
            caption: "Swap this for a real screenshot.",
            rounded: "yes",
          }),
          b("heading", { text: "Ready to start?", align: "center" }),
          b("text", { text: "Free to try. Takes about thirty seconds to set up.", align: "center" }),
          b("button", { text: "Get started", link: "#", variant: "solid", align: "center" }),
          b("footer", {
            text: "\u00A9 2026 Launch Day",
            links: [
              { label: "Twitter", href: "https://twitter.com" },
              { label: "Contact", href: "mailto:hello@example.com" },
            ],
          }),
        ]),
      ],
    }),
  },

  {
    id: "event",
    name: "Event",
    tagline: "A party, a meetup, a school club night.",
    build: () => ({
      title: "Game Night 2026",
      theme: theme({ accent: "#e11d48", bg: "#fff7f8", text: "#1f1013", maxWidth: 760, radius: 20 }),
      nav: true,
      pages: [
        page("Home", [
          b("hero", {
            heading: "Game Night 2026",
            subheading: "Friday 14 March \u00B7 6pm \u00B7 The school hall",
            buttonText: "How to find us",
            buttonLink: "#getting-there",
            style: "gradient",
            align: "center",
          }),
          b("text", {
            text: "Bring a controller and a friend. There'll be four screens, a tournament bracket, and far too much pizza.",
            align: "center",
          }),
          b("features", {
            title: "What's happening",
            items: [
              { icon: "\u{1F3C6}", title: "Tournament", body: "Sign-ups from 6pm, first round at 6:30." },
              { icon: "\u{1F355}", title: "Food", body: "Pizza, crisps, and something fizzy." },
              { icon: "\u{1F381}", title: "Prizes", body: "For the winner, and for the best loser." },
            ],
          }),
        ]),
        page("Getting there", [
          b("heading", { text: "How to find us", align: "center" }),
          b("text", {
            text: "The main hall, through the doors by the car park. Look for the balloons.",
            align: "center",
          }),
          b("image", {
            src: "https://picsum.photos/seed/map/1200/600",
            alt: "A map of the venue",
            caption: "Replace this with a real map screenshot.",
            rounded: "yes",
          }),
          b("footer", {
            text: "Questions? Ask in the group chat.",
            links: [{ label: "Email the organisers", href: "mailto:hello@example.com" }],
          }),
        ]),
      ],
    }),
  },

  {
    id: "practice",
    name: "Formal",
    tagline: "A firm, a practice, a professional body.",
    build: () => ({
      title: "Whitcombe & Hale",
      theme: theme({
        accent: "#1e3a5f",
        bg: "#fcfbf8",
        text: "#17191c",
        muted: "#5b6471",
        font: "garamond",
        maxWidth: 720,
        radius: 2,
      }),
      nav: true,
      pages: [
        page("Home", [
          b("hero", {
            heading: "Whitcombe & Hale",
            subheading: "Solicitors \u00B7 Established 1928 \u00B7 Lincoln\u2019s Inn Fields, London",
            buttonText: "Request a consultation",
            buttonLink: "#contact",
            style: "plain",
            align: "center",
          }),
          b("text", {
            text: "We advise private clients, trustees and closely held companies on matters that are rarely straightforward and seldom urgent in the way they first appear.\n\nMost of our work comes by recommendation. We take a small number of instructions and give each of them the attention it requires.",
            align: "left",
          }),
          b("features", {
            title: "Areas of practice",
            items: [
              { icon: "", title: "Private client", body: "Wills, trusts, estates and the administration that follows." },
              { icon: "", title: "Corporate", body: "Shareholder agreements, succession, and the sale of family businesses." },
              { icon: "", title: "Property", body: "Freehold and leasehold transactions, landed estates, and disputes arising from them." },
            ],
          }),
          b("button", { text: "The firm", link: "#the-firm", variant: "outline", align: "center" }),
        ]),

        page("The firm", [
          b("heading", { text: "The firm", align: "left" }),
          b("text", {
            text: "Whitcombe & Hale was founded in 1928 and has occupied the same building since 1954. There are eleven of us: four partners, five associates, and two who keep the rest of us in order.\n\nWe are regulated by the Solicitors Regulation Authority. Our terms of business are provided in writing before any work begins, and our fees are agreed in advance.",
            align: "left",
          }),
          b("heading", { text: "How we work", align: "left" }),
          b("text", {
            text: "One partner takes responsibility for each matter and remains responsible for it throughout. Correspondence is answered within two working days. Where a matter falls outside our competence, we will say so and recommend someone better placed to help.",
            align: "left",
          }),
        ]),

        page("Contact", [
          b("heading", { text: "Contact", align: "left" }),
          b("text", {
            text: "New enquiries are welcome by letter, telephone or email. Please do not send confidential material until we have confirmed that we are able to act.",
            align: "left",
          }),
          b("text", {
            text: "12 Lincoln\u2019s Inn Fields\nLondon WC2A 3BP\n\nTelephone 020 7946 0318\nenquiries@whitcombehale.example",
            align: "left",
          }),
          b("button", {
            text: "Email the firm",
            link: "mailto:enquiries@whitcombehale.example",
            variant: "solid",
            align: "left",
          }),
          b("footer", {
            text: "Whitcombe & Hale LLP is authorised and regulated by the Solicitors Regulation Authority.",
            links: [
              { label: "Terms of business", href: "#" },
              { label: "Privacy notice", href: "#" },
            ],
          }),
        ]),
      ],
    }),
  },

  {
    id: "article",
    name: "Article",
    tagline: "A blog post, essay, or write-up.",
    build: () => ({
      title: "How I Built a Site Builder",
      theme: theme({ accent: "#15803d", bg: "#fffefb", font: "serif", maxWidth: 680, radius: 6 }),
      nav: false,
      pages: [
        page("Home", [
          b("heading", { text: "How I Built a Site Builder", align: "left" }),
          b("text", { text: "13 September 2026 \u00B7 4 minute read", align: "left" }),
          b("image", {
            src: "https://picsum.photos/seed/article/1200/600",
            alt: "A photo for the top of the article",
            caption: "",
            rounded: "no",
          }),
          b("text", {
            text: "Start with the interesting bit. Don't warm up \u2014 the first sentence decides whether anyone reads the second one.\n\nThen explain the problem you had, what you tried, and what actually worked. Specific beats general every time.",
            align: "left",
          }),
          b("heading", { text: "What I learned", align: "left" }),
          b("text", {
            text: "Finish with the thing you'd tell yourself at the start, before you knew any of this.",
            align: "left",
          }),
          b("footer", { text: "Thanks for reading.", links: [{ label: "More posts", href: "#" }] }),
        ]),
      ],
    }),
  },
];
