"use client";

import React, { useState, useEffect } from "react";
import { 
  Upload, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  DollarSign, 
  Leaf, 
  BookOpen, 
  Calculator,
  CheckCircle2,
  XCircle,
  ArrowRight,
  PieChart,
  ChefHat,
  Clock,
  Utensils,
  Search,
  X,
  Pencil,
  UserRound,
  MessageCircle,
  Share2,
  Link2,
  Flag,
  Scale,
  ScanBarcode,
  Languages,
  Plus,
  Camera
} from "lucide-react";

interface NutritionInfo {
  serving_size_g?: number;
  servings_per_package?: number;
  energy_kcal?: number;
  protein_g?: number;
  carbohydrates_g?: number;
  sugar_g?: number;
  added_sugar_g?: number;
  total_fat_g?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;
  sodium_mg?: number;
  fiber_g?: number;
}

interface ExtractedIngredient {
  name: string;
  ins_number?: string;
  category?: string;
}

interface IngredientFlag {
  ingredient_name: string;
  severity: "high" | "medium" | "low" | "info";
  flag_type: string;
  title?: string;
  explanation: string;
  regulatory_source?: string;
}

interface ClaimVerification {
  claim: string;
  status: "verified" | "misleading" | "debunked";
  explanation: string;
  fssai_rule?: string;
}

interface MathVerification {
  printed_calories?: number;
  calculated_calories?: number;
  discrepancy_percentage?: number;
  is_discrepant: boolean;
  details: string;
}

interface NaturalAlternative {
  nutrient?: string;
  food_name: string;
  quantity: string;
  nutrient_amount: string;
  approx_cost_inr?: number;
  note?: string;
  diet_type?: string;
}

interface EducationalNote {
  topic_id: string;
  title: string;
  explanation: string;
  triggered_by: string;
}

interface PriceAnalysis {
  price_inr: number;
  price_source?: "mrp" | "paid";
  mrp_inr?: number | null;
  price_paid_inr?: number | null;
  discount_pct?: number | null;
  price_per_g_protein?: number;
  value_verdict: string;
}

interface IngredientShare {
  name: string;
  percentage: number;
  is_estimated: boolean;
  source: string;
  category: string;
  color_hint: string;
}

interface IngredientBreakdown {
  shares: IngredientShare[];
  has_hero_trap: boolean;
  hero_insight?: string;
  filler_percentage: number;
  hero_percentage: number;
  coverage_percentage: number;
  fssai_disclosure?: string;
  descending_ingredients?: string[];
  undeclared_ingredients?: string[];
}

interface ServingReality {
  servings_in_package?: number;
  expected_consumption_g?: number;
  nutrition_full_package?: NutritionInfo;
  nutrition_for_expected_consumption?: NutritionInfo;
  realistic_consumption: string;
}

interface HomemadeRecipe {
  id: string;
  name: string;
  category: string;
  dietary_type: "veg" | "egg" | "non_veg";
  prep_time_minutes: number;
  target_craving: string;
  hero_ingredients: string[];
  instructions: string;
  why_better: string;
  approx_cost_inr: number;
}

interface ScoreFactor {
  points: number;
  label: string;
}

interface ProductAnalysis {
  scan_id?: number | null;
  score_factors?: ScoreFactor[];
  score_basis?: string;
  data_source?: "label_scan" | "open_food_facts" | null;
  report_count?: number;
  language?: string;
  extraction: {
    product_name?: string;
    brand?: string;
    variant?: string | null;
    sub_category?: string | null;
    mrp_inr?: number | null;
    net_weight_g?: number | null;
    barcode?: string | null;
    nutrition_per_100g?: NutritionInfo | null;
    product_category?: string;
    category_reasoning?: string;
    nutrition_per_serving?: NutritionInfo;
    ingredients: ExtractedIngredient[];
    claims: string[];
  };
  product_category?: string;
  category_display_name?: string;
  sub_category?: string | null;
  sub_category_display_name?: string | null;
  health_score?: number;
  one_line_summary: string;
  detailed_summary: string;
  ingredient_flags: IngredientFlag[];
  claim_verifications: ClaimVerification[];
  math_verification?: MathVerification;
  price_analysis?: PriceAnalysis;
  ingredient_breakdown?: IngredientBreakdown;
  serving_reality?: ServingReality;
  natural_alternatives: NaturalAlternative[];
  homemade_recipes?: HomemadeRecipe[];
  educational_notes: EducationalNote[];
}

interface HistoryCard {
  id: number;
  created_at: string;
  product_name: string;
  product_category?: string;
  sub_category?: string | null;
  brand?: string;
  variant?: string | null;
  mrp_inr?: number | null;
  price_inr?: number;
  health_score?: number;
  one_line_summary: string;
  protein_per_serving_g?: number;
  calories_per_serving?: number;
  price_per_g_protein?: number;
  flag_count: number;
  debunked_claims_count: number;
  misleading_claims_count: number;
  has_calorie_discrepancy: boolean;
}

interface AlternativesResult {
  scope: "sub_category" | "category";
  scope_label: string;
  rank?: number | null;
  total: number;
  better: HistoryCard[];
}

// "Britannia Bourbon (Chocolate Cream)" without repeating the brand or variant
// Same Hinglish normalisation as the backend search: "bhujiya" ≈ "bhujia", "maggi" ≈ "magi"
function phonetic(text: string): string {
  let t = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [a, b] of [["ph", "f"], ["ee", "i"], ["oo", "u"], ["y", "i"], ["w", "v"], ["z", "j"], ["q", "k"]]) t = t.split(a).join(b);
  return t.replace(/(.)\1+/g, "$1");
}

// Compare ignoring case and punctuation, so "Lay's" matches "Lays"
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
function productTitle(brand?: string | null, name?: string | null, variant?: string | null): string {
  let title = name || "Packaged Food Product";
  if (brand && !squash(title).startsWith(squash(brand))) title = `${brand} ${title}`;
  if (variant && !squash(title).includes(squash(variant))) title = `${title} (${variant})`;
  return title;
}

// Edit tokens prove "I scanned this" so only the scanner can fix a misread name.
// Kept in this browser only.
const EDIT_TOKENS_KEY = "labelpadho_edit_tokens";
function loadEditTokens(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(EDIT_TOKENS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveEditToken(scanId: number, token: string) {
  try {
    const tokens = loadEditTokens();
    tokens[scanId] = token;
    localStorage.setItem(EDIT_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* storage unavailable: rename simply won't survive a reload */
  }
}

// In Next.js, env vars prefixed with NEXT_PUBLIC_ are available in the browser.
// Locally: falls back to localhost:8000
// On Vercel: set NEXT_PUBLIC_API_URL to your Render backend URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Questions shoppers actually ask in the aisle, floated behind the hero.
// [text, position classes, show on small screens?]
const AISLE_QUESTIONS: [string, string, boolean][] = [
  ["Is this protein bar actually healthy?", "top-[2.5%] left-[4%] -rotate-2 lg:top-[6%] lg:left-[3%]", true],
  ["Multigrain, or mostly maida?", "top-[10%] right-[4%] rotate-2", false],
  ["How much sugar is in my juice?", "top-[24%] left-[2%] rotate-1", false],
  ["\"No added sugar\", full story?", "top-[26%] right-[2%] -rotate-2", false],
  ["Okay for my kid's tiffin?", "bottom-[15%] left-[2%] rotate-2", false],
  ["Why is the serving size so tiny?", "bottom-[15%] right-[2%] -rotate-1", false],
  ["High protein, or high marketing?", "bottom-[2.5%] right-[4%] rotate-1 lg:bottom-[3%] lg:right-auto lg:left-[22%]", true],
  ["Is \"diet\" namkeen really diet?", "bottom-[3%] right-[22%] rotate-1", false],
  ["Is brown bread really brown?", "top-[2%] left-[38%] rotate-1", false],
];
const MAX_CLAIM_PHOTOS = 4;

// ============================================================
// First-party analytics: anonymous events to our own backend.
// No cookies, no IPs, no personal data: a random per-tab session id,
// the campaign tags (utm_*) the visitor arrived with, and what they did.
// ============================================================

const SESSION_KEY = "labelpadho_session";
const UTM_KEY = "labelpadho_utm";

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// Remember how this visitor arrived, before the address bar is rewritten to /p/<id>
function captureArrival() {
  const store = safeSession();
  if (!store || store.getItem(UTM_KEY)) return;
  const params = new URLSearchParams(window.location.search);
  let referrer: string | null = null;
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    referrer = host && host !== window.location.hostname ? host.replace(/^www\./, "") : null;
  } catch {
    /* unparsable referrer */
  }
  store.setItem(
    UTM_KEY,
    JSON.stringify({
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      referrer_host: referrer,
    })
  );
}

function sessionId(): string | null {
  const store = safeSession();
  if (!store) return null;
  let id = store.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.setItem(SESSION_KEY, id);
  }
  return id;
}

type TrackExtra = { product_id?: number | null; detail?: string | null; value?: number | null };

function track(name: string, extra: TrackExtra = {}) {
  try {
    const arrival = JSON.parse(safeSession()?.getItem(UTM_KEY) || "{}");
    fetch(`${API_BASE}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, session_id: sessionId(), ...arrival, ...extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

// Share links carry their channel, so visits from shares can be counted
const shareUrl = (scanId: number, source: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/p/${scanId}?utm_source=${source}&utm_medium=share`;

// Pre-computed instant demo audit for recruiters or quick testing
const DEMO_AUDIT: ProductAnalysis = {
  extraction: {
    product_name: "Nutri-Choice Multigrain Digestive Biscuits",
    brand: "Britannia Style Sample",
    product_category: "dessert_sweet",
    nutrition_per_serving: {
      serving_size_g: 25,
      servings_per_package: 4,
      energy_kcal: 118,
      protein_g: 2.1,
      carbohydrates_g: 17.5,
      sugar_g: 6.2,
      total_fat_g: 4.4,
      saturated_fat_g: 2.1,
      trans_fat_g: 0,
      sodium_mg: 115,
      fiber_g: 1.4,
    },
    ingredients: [
      { name: "Refined Wheat Flour (Maida) (54%)" },
      { name: "Refined Palm Oil" },
      { name: "Sugar" },
      { name: "Wheat Flour (Atta) (7%)" },
      { name: "Rolled Oats (4%)" },
      { name: "Invert Sugar Syrup" },
      { name: "Raising Agents (INS 500(ii), INS 503(ii))" },
    ],
    claims: ["Multigrain", "Source of Fibre", "0% Trans Fat", "No Palm Oil Disguise"],
  },
  product_category: "dessert_sweet",
  category_display_name: "Dessert & Sweet Treat",
  health_score: 4,
  one_line_summary: "Marketed as a wholesome multigrain digestive snack, but 54% refined maida with palm oil and sugar.",
  detailed_summary: "Despite prominent health marketing and green packaging, Refined Wheat Flour (Maida) forms the overwhelming primary ingredient. The 'multigrain' oats make up only 4% of the cookie. Contains refined palm oil and fast-absorbing invert sugar syrup.",
  ingredient_flags: [
    {
      ingredient_name: "Refined Palm Oil",
      severity: "medium",
      flag_type: "health_concern",
      title: "High Saturated Fat Palm Fat",
      explanation: "Palm oil is heavily refined and high in saturated palmitic acid, frequently used as a cheap industrial shortening.",
    },
    {
      ingredient_name: "Invert Sugar Syrup",
      severity: "low",
      flag_type: "hidden_name",
      title: "Alternate Liquid Sugar",
      explanation: "Splits sucrose into glucose and fructose, causing faster blood sugar spikes than whole grains.",
    },
  ],
  claim_verifications: [
    {
      claim: "Multigrain",
      status: "misleading",
      explanation: "Packaged as 'Multigrain', but the first (largest) ingredient by weight is Refined Wheat Flour (Maida) at 54%. Grains other than wheat make up only 4% (oats).",
      fssai_rule: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations",
    },
    {
      claim: "Source of Fibre",
      status: "misleading",
      explanation: "Provides only 1.4g fiber per serving (5.6% by weight). You would need to consume 4 whole packets to reach your daily fiber goal.",
      fssai_rule: "FSSAI Schedule I Dietary Fibre Standard",
    },
    {
      claim: "0% Trans Fat",
      status: "verified",
      explanation: "Contains 0g trans fatty acids per serving, meeting the FSSAI threshold (< 0.2g).",
      fssai_rule: "FSSAI Trans Fat Limit Regulations 2022",
    },
  ],
  math_verification: {
    printed_calories: 118,
    calculated_calories: 120,
    discrepancy_percentage: 1.7,
    is_discrepant: false,
    details: "Physical calorie balance verified (1.7% variance, within statutory Atwater tolerance).",
  },
  price_analysis: {
    price_inr: 45,
    value_verdict: "Priced at ₹45. You are paying a 2x premium over basic biscuits primarily for health marketing, not whole grain nutrition.",
  },
  ingredient_breakdown: {
    has_hero_trap: true,
    hero_insight: "Packaging prominently advertises 'Rolled Oats', but it constitutes only 4.0% of the cookie. In contrast, cheap fillers (Refined Wheat Flour (Maida) 54%, Sweeteners 22%, and undeclared palm oil/leaveners) make up 96.0%.",
    hero_percentage: 4.0,
    filler_percentage: 89.0,
    coverage_percentage: 87.0,
    fssai_disclosure: "Under FSSAI Labelling Regulations (Regulation 5), companies are only required to declare exact percentages for characterizing hero ingredients (QUID). Remaining ingredients appear in strict descending order of weight. LabelPadho groups undeclared ingredients together rather than fabricating unverified percentages.",
    descending_ingredients: [
      "Refined Wheat Flour (Maida) (54%)",
      "Sugar",
      "Refined Palm Oil",
      "Wheat Flour (Atta) (7%)",
      "Rolled Oats (4%)",
      "Invert Sugar Syrup",
      "Raising Agents (INS 500(ii), INS 503(ii))"
    ],
    undeclared_ingredients: ["Refined Palm Oil", "Invert Sugar Syrup", "Raising Agents"],
    shares: [
      { name: "Refined Wheat Flour (Maida)", percentage: 54.0, is_estimated: false, source: "declared", category: "flour_grain", color_hint: "#3b82f6" },
      { name: "Total Sweeteners (Sugar & Syrup)", percentage: 22.0, is_estimated: true, source: "nutrition_derived", category: "sweetener", color_hint: "#ef4444" },
      { name: "Undeclared Base & Additives (Palm Oil, Leaveners)", percentage: 13.0, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
      { name: "Wheat Flour (Atta)", percentage: 7.0, is_estimated: false, source: "declared", category: "flour_grain", color_hint: "#60a5fa" },
      { name: "Rolled Oats", percentage: 4.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#10b981" },
    ],
  },
  natural_alternatives: [
    {
      nutrient: "clean sweet craving",
      food_name: "Medjool Dates with Walnuts",
      quantity: "2 dates + 3 walnuts",
      nutrient_amount: "Natural sweetness + 3g fiber + magnesium",
      approx_cost_inr: 15,
      note: "No refined flour, zero palm oil, naturally sweet with healthy fats.",
    },
    {
      nutrient: "clean sweet craving",
      food_name: "Dark Chocolate (75%+ Cacao)",
      quantity: "20g",
      nutrient_amount: "Flavonoid antioxidants + only 4g sugar",
      approx_cost_inr: 25,
      note: "Low glycemic load compared to sweet biscuits; zero refined starches.",
    },
  ],
  homemade_recipes: [
    {
      id: "atta_jaggery_pinni",
      name: "Pan-Toasted Atta Jaggery Nankhatai",
      category: "dessert_sweet",
      dietary_type: "veg",
      prep_time_minutes: 10,
      target_craving: "Sweet biscuit or cookie craving",
      hero_ingredients: ["Atta (Whole Wheat)", "Jaggery Powder (Gud)", "Desi Ghee", "Cardamom (Elaichi)"],
      instructions: "Mix 4 tbsp atta with 1 tbsp melted ghee and 1.5 tbsp jaggery powder. Shape into small cookies and toast on low heat on a covered tawa for 4-5 mins per side.",
      why_better: "Zero palm oil, 100% whole wheat with natural fiber, zero white refined sugar or artificial invert syrup.",
      approx_cost_inr: 12,
    },
    {
      id: "dark_choc_makhana",
      name: "Cacao Roasted Makhana Crunch",
      category: "dessert_sweet",
      dietary_type: "veg",
      prep_time_minutes: 5,
      target_craving: "Chocolate bar or sweet crispy treat",
      hero_ingredients: ["Phool Makhana", "Dark Chocolate (70%+)", "Ghee (1/2 tsp)"],
      instructions: "Dry roast 1 cup makhana in 1/2 tsp ghee until crunchy. Melt 2 cubes dark chocolate with 1 tsp warm milk, toss makhana in glaze, cool for 2 mins.",
      why_better: "Rich in magnesium and antioxidants; low glycemic load compared to ultra-processed cookies filled with hydrogenated fats.",
      approx_cost_inr: 20,
    },
    {
      id: "banana_egg_pancake",
      name: "Quick Cinnamon Banana Pancake",
      category: "dessert_sweet",
      dietary_type: "egg",
      prep_time_minutes: 6,
      target_craving: "Bakery cake or sweet cookie craving",
      hero_ingredients: ["1 Whole Egg", "1 Ripe Banana", "2 tbsp Atta", "Cinnamon"],
      instructions: "Mash 1 ripe banana, whisk in 1 egg, 2 tbsp atta, pinch cinnamon. Pour onto a lightly greased pan and cook 2 mins per side until golden.",
      why_better: "Natural sweetness from fruit, 7g bioavailable protein from real egg, zero high-fructose corn syrup.",
      approx_cost_inr: 15,
    },
  ],
  educational_notes: [],
};

// These are deliberately pre-computed: a recruiter can explore the rule engine
// immediately, without waiting for a free-tier backend cold start.
const DEMO_AUDITS: { label: string; analysis: ProductAnalysis }[] = [
  { label: "Biscuit claim", analysis: DEMO_AUDIT },
  {
    label: "Protein bar",
    analysis: {
      ...DEMO_AUDIT,
      extraction: {
        product_name: "RiteBite Max Protein Daily Bar",
        brand: "RiteBite",
        product_category: "protein_fitness",
        nutrition_per_serving: {
          serving_size_g: 50,
          servings_per_package: 1,
          energy_kcal: 230,
          protein_g: 10,
          carbohydrates_g: 22,
          sugar_g: 12,
          added_sugar_g: 9,
          total_fat_g: 11,
          saturated_fat_g: 4.5,
          sodium_mg: 95,
          fiber_g: 5,
        },
        ingredients: [
          { name: "Protein Blend (Soy Protein Isolate, Whey Protein Concentrate, Calcium Caseinate) (28%)" },
          { name: "Glucose Syrup" },
          { name: "Milk Compound (Sugar, Hydrogenated Vegetable Palm Fat, Cocoa Solids)" },
          { name: "Roasted Peanuts (7%)" },
          { name: "Soy Protein Nuggets" },
          { name: "Whole Grain Rolled Oats (4%)" },
          { name: "Dark Chocolate Drops" },
          { name: "Humectant (Glycerine)" },
        ],
        claims: ["10g Protein", "High Fibre", "Sustained Energy"],
      },
      product_category: "protein_fitness",
      category_display_name: "Protein & Fitness",
      health_score: 5,
      one_line_summary: "Provides 10g protein, but packs 12g sugar (24%) and hydrogenated palm fat in a 50g bar.",
      detailed_summary: "Marketed to fitness enthusiasts as a wholesome daily snack. While it delivers 10g protein from soy and whey isolates, 24% of the bar is pure sugar (12g)—more sugar than protein! It also uses cheap hydrogenated palm fat in the chocolate compound coating.",
      claim_verifications: [
        { claim: "10g Protein", status: "verified", explanation: "Delivers 10g protein per 50g bar (20g per 100g), primarily from soy isolate and whey concentrate.", fssai_rule: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations" },
        { claim: "High Fibre", status: "verified", explanation: "Contains 5g dietary fiber per serving (10% by weight) derived from added fructooligosaccharides.", fssai_rule: "FSSAI Schedule I Dietary Fibre Standard" },
        { claim: "Sustained Energy", status: "misleading", explanation: "Contains 12g fast-digesting sugar and liquid glucose syrup which trigger rapid blood glucose spikes followed by insulin crashes.", fssai_rule: "Consumer glycemic health guidance" },
      ],
      math_verification: {
        printed_calories: 230,
        calculated_calories: 227,
        discrepancy_percentage: 1.3,
        is_discrepant: false,
        details: "Calorie sum matches macronutrients within standard 1.3% Atwater tolerance.",
      },
      price_analysis: {
        price_inr: 70,
        price_per_g_protein: 7.0,
        value_verdict: "₹7.0 per gram of protein. You pay a heavy markup over whole-food Indian proteins (Eggs ₹1.1/g, Sattu ₹1.0/g, Paneer ₹2.2/g).",
      },
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "Marketed as a fitness bar, but 24.0% of the bar is pure sugar (12g sugar vs 10g protein). The bar also hides 37.0% undeclared hydrogenated palm fat and cocoa compound.",
        hero_percentage: 39.0,
        filler_percentage: 61.0,
        coverage_percentage: 63.0,
        fssai_disclosure: "Under FSSAI Labelling Regulations (Regulation 5), brands declare QUID percentages for characterizing ingredients (Protein blend 28%, Peanuts 7%, Oats 4%). The remaining chocolate coating, palm fat, and humectants appear in statutory descending order of weight.",
        descending_ingredients: [
          "Protein Blend (Soy Isolate, Whey, Caseinate) (28%)",
          "Glucose Syrup",
          "Milk Compound (Sugar, Hydrogenated Palm Fat, Cocoa)",
          "Roasted Peanuts (7%)",
          "Soy Protein Nuggets",
          "Whole Grain Rolled Oats (4%)",
          "Humectant (Glycerine)"
        ],
        undeclared_ingredients: ["Glucose Syrup", "Milk Compound", "Soy Protein Nuggets", "Humectant"],
        shares: [
          { name: "Undeclared Chocolate Compound & Palm Fat", percentage: 37.0, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
          { name: "Protein Blend (Soy & Whey)", percentage: 28.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#10b981" },
          { name: "Total Sweeteners (Glucose & Sugar)", percentage: 24.0, is_estimated: true, source: "nutrition_derived", category: "sweetener", color_hint: "#ef4444" },
          { name: "Roasted Peanuts", percentage: 7.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#059669" },
          { name: "Rolled Oats", percentage: 4.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#34d399" },
        ],
      },
      natural_alternatives: [
        { nutrient: "complete protein", food_name: "Boiled Eggs (2 eggs)", quantity: "100g", nutrient_amount: "12g complete protein", approx_cost_inr: 14, note: "All 9 essential amino acids + choline; zero added sugar." },
        { nutrient: "plant protein", food_name: "Roasted Chana Sattu Cooler", quantity: "40g", nutrient_amount: "10g plant protein", approx_cost_inr: 10, note: "Complex low-GI carbs and natural insoluble fiber." },
        { nutrient: "whole dairy protein", food_name: "Fresh Paneer", quantity: "70g", nutrient_amount: "13g protein + calcium", approx_cost_inr: 30, note: "Unprocessed whole dairy protein." },
      ],
      homemade_recipes: [
        {
          id: "sattu_buttermilk_shake",
          name: "Bihari Chana Sattu Protein Cooler",
          category: "protein_fitness",
          dietary_type: "veg",
          prep_time_minutes: 3,
          target_craving: "Protein bar or packaged protein shake craving",
          hero_ingredients: ["Roasted Chana Sattu (3 tbsp)", "Chilled Water or Thin Chaas", "Roasted Jeera", "Lemon Juice", "Kala Namak"],
          instructions: "Whisk 3 heaped tablespoons of sattu into 250ml chilled chaas or water with lemon juice, roasted jeera, and black salt until smooth.",
          why_better: "Provides 10g clean whole-food plant protein, insoluble fiber, and magnesium for only ₹10, with zero artificial sucralose or thickeners.",
          approx_cost_inr: 10.0,
        },
        {
          id: "tawa_masala_paneer",
          name: "Pan-Seared Kasuri Methi Paneer",
          category: "protein_fitness",
          dietary_type: "veg",
          prep_time_minutes: 6,
          target_craving: "High protein processed snack or nuggets",
          hero_ingredients: ["Fresh Paneer (100g)", "Kasuri Methi", "Chaat Masala", "Turmeric & Pepper", "Ghee (1/2 tsp)"],
          instructions: "Cut paneer into cubes, dust with chaat masala, pepper, and crushed kasuri methi. Sear in 1/2 tsp warm ghee on a hot tawa for 2 minutes.",
          why_better: "18g intact casein and whey protein with bioavailable calcium; zero soy protein isolates or cheap vegetable fat extenders.",
          approx_cost_inr: 40.0,
        },
        {
          id: "boiled_egg_street_chaat",
          name: "Street-Style Boiled Egg Chaat",
          category: "protein_fitness",
          dietary_type: "egg",
          prep_time_minutes: 5,
          target_craving: "High protein snack craving",
          hero_ingredients: ["2 Hard-Boiled Eggs", "Finely Chopped Onion & Tomato", "Fresh Coriander", "Green Chutney", "Lemon Juice"],
          instructions: "Slice 2 boiled eggs into rounds, top with chopped onion, tomato, fresh green chutney, chaat masala, and a squeeze of lemon.",
          why_better: "12g complete protein with all 9 essential amino acids and vitamin B12 for ₹14, beating ₹100+ ultra-processed protein cookies.",
          approx_cost_inr: 14.0,
        },
      ],
    },
  },
  {
    label: "Soda sugar",
    analysis: {
      ...DEMO_AUDIT,
      extraction: {
        product_name: "Coca-Cola Original Taste (300ml)",
        brand: "The Coca-Cola Company",
        product_category: "beverage_soda",
        nutrition_per_serving: {
          serving_size_g: 300,
          servings_per_package: 1,
          energy_kcal: 126,
          protein_g: 0,
          carbohydrates_g: 31.5,
          sugar_g: 31.5,
          added_sugar_g: 31.5,
          total_fat_g: 0,
          sodium_mg: 42,
        },
        ingredients: [
          { name: "Carbonated Water" },
          { name: "Sugar" },
          { name: "Acidity Regulator (INS 338)" },
          { name: "Caramel Colour (INS 150d)" },
          { name: "Natural Flavouring Substances" },
          { name: "Caffeine" },
        ],
        claims: ["Original Taste", "Refreshing"],
      },
      product_category: "beverage_soda",
      category_display_name: "Soda & Soft Drink",
      health_score: 2,
      one_line_summary: "Contains 31.5g sugar in one bottle (10.5% sugar by volume), exceeding the daily free-sugar limit.",
      detailed_summary: "A 300ml bottle delivers ~8 teaspoons of pure dissolved sugar (31.5g). Liquid sugar enters the bloodstream without any dietary fiber or fat to slow absorption, prompting sudden insulin spikes. Contains phosphoric acid (INS 338), which can erode tooth enamel over time.",
      claim_verifications: [
        { claim: "Refreshing", status: "misleading", explanation: "Marketing slogan masking an intense sugar load (31.5g) that causes dehydration and blood sugar crashes.", fssai_rule: "FSSAI Advertising and Claims Regulation" },
        { claim: "Original Taste", status: "verified", explanation: "Standard formula containing carbonated water, sugar, phosphoric acid, and caramel color.", fssai_rule: "Ingredient standard compliance" },
      ],
      price_analysis: undefined,
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "Over 10.5% of this beverage is pure sugar (31.5g in one 300ml bottle). You are drinking predominantly flavored liquid sugar with carbonated water and caramel color.",
        hero_percentage: 0.0,
        filler_percentage: 10.5,
        coverage_percentage: 99.5,
        fssai_disclosure: "Under FSSAI Regulations, carbonated beverages list ingredients in strict descending order of weight. Water forms the bulk (listed first), followed by sugar (#2), and micro-additives (INS 338, 150d) at <1%.",
        descending_ingredients: [
          "Carbonated Water",
          "Sugar",
          "Acidity Regulator (INS 338 - Phosphoric Acid)",
          "Colour (INS 150d - Sulphite Ammonia Caramel)",
          "Natural Flavouring Substances",
          "Caffeine"
        ],
        undeclared_ingredients: ["Acidity Regulator (INS 338)", "Colour (INS 150d)", "Natural Flavours", "Caffeine"],
        shares: [
          { name: "Carbonated Water (Liquid Base)", percentage: 89.0, is_estimated: true, source: "nutrition_derived", category: "beverage_base", color_hint: "#06b6d4" },
          { name: "Added Refined Sugar", percentage: 10.5, is_estimated: true, source: "nutrition_derived", category: "sweetener", color_hint: "#ef4444" },
          { name: "Undeclared Additives (INS 338, 150d, Caffeine)", percentage: 0.5, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
        ],
      },
      natural_alternatives: [
        { nutrient: "refreshing drink", food_name: "Fresh Coconut Water", quantity: "250ml", nutrient_amount: "Natural potassium electrolytes", approx_cost_inr: 50, note: "Zero added sugar, 100% natural isotonic hydration." },
        { nutrient: "refreshing drink", food_name: "Chilled Buttermilk (Chaas)", quantity: "250ml", nutrient_amount: "Gut probiotics & calcium", approx_cost_inr: 15, note: "Digestive cooling with zero sugar." },
      ],
      homemade_recipes: [
        {
          id: "desi_shikanji_soda",
          name: "Desi Shikanji Sparkling Soda",
          category: "beverage_soda",
          dietary_type: "veg",
          prep_time_minutes: 3,
          target_craving: "Cold fizzy soda or cola craving",
          hero_ingredients: ["Plain Sparkling Soda or Chilled Water", "Fresh Nimbu (Lemon)", "Kala Namak (Rock Salt)", "Roasted Cumin", "1 tsp Raw Honey"],
          instructions: "Squeeze half a fresh lemon into a glass, add a pinch of kala namak, roasted jeera powder, and 1 tsp raw sweetener. Pour chilled plain club soda over it.",
          why_better: "Only ~4g natural sugar vs 35g refined sugar in commercial cola. Rich in natural Vitamin C and electrolytes with zero phosphoric acid or caramel colour.",
          approx_cost_inr: 12.0,
        },
        {
          id: "pudina_chaas",
          name: "Chilled Mint & Jeera Chaas",
          category: "beverage_soda",
          dietary_type: "veg",
          prep_time_minutes: 4,
          target_craving: "Fizzy drink or canned beverage craving",
          hero_ingredients: ["Fresh Curd (Dahi)", "Fresh Mint (Pudina)", "Roasted Jeera", "Black Salt", "Chilled Water"],
          instructions: "Blend 1/2 cup fresh dahi with 1 cup cold water, fresh mint leaves, roasted jeera, and black salt for 30 seconds until frothy.",
          why_better: "Natural gut probiotics, natural cooling hydration, zero added sugar, zero artificial preservatives.",
          approx_cost_inr: 8.0,
        },
      ],
    },
  },
  {
    label: "Snack sodium",
    analysis: {
      ...DEMO_AUDIT,
      extraction: {
        product_name: "Haldiram's Nagpur Aloo Bhujia (150g)",
        brand: "Haldiram's",
        product_category: "savory_snack",
        nutrition_per_serving: {
          serving_size_g: 30,
          servings_per_package: 5,
          energy_kcal: 172,
          protein_g: 2.8,
          carbohydrates_g: 13.2,
          sugar_g: 0.8,
          total_fat_g: 12.0,
          saturated_fat_g: 5.2,
          trans_fat_g: 0,
          sodium_mg: 410,
        },
        ingredients: [
          { name: "Potatoes (Aloo) (44%)" },
          { name: "Edible Vegetable Oil (Palmolein Oil)" },
          { name: "Gram Pulse Flour (Besan) (12%)" },
          { name: "Tepary Bean Flour (Moth Dal Flour)" },
          { name: "Iodised Salt" },
          { name: "Red Chilli Powder" },
          { name: "Spices & Condiments (Black Pepper, Clove, Cardamom, Mint)" },
          { name: "Acidity Regulator (INS 330)" },
        ],
        claims: ["No Cholesterol", "Zero Trans Fat", "Traditional Taste"],
      },
      product_category: "savory_snack",
      category_display_name: "Savory Snack",
      health_score: 4,
      one_line_summary: "Deep-fried snack containing 40% industrial palmolein oil and 410mg sodium per small 30g serving.",
      detailed_summary: "While marketed with 'No Cholesterol' (a marketing trick since plant oils never contain cholesterol), 40% of this snack is pure refined palmolein oil. Eating the typical 150g packet delivers 60g of heated industrial fat and 2,050mg sodium—exceeding your maximum daily salt limit.",
      claim_verifications: [
        { claim: "No Cholesterol", status: "misleading", explanation: "Plant-based oils and potatoes are inherently 100% cholesterol-free by biological nature; this does not make a 40% deep-fried snack heart-healthy.", fssai_rule: "FSSAI Claims Regulation on inherent characteristics" },
        { claim: "Zero Trans Fat", status: "verified", explanation: "Contains < 0.2g trans fat per 100g, compliant with FSSAI statutory trans fat limits.", fssai_rule: "FSSAI Trans Fat Regulations 2022" },
      ],
      price_analysis: undefined,
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "Contains 40.0% edible palmolein oil by weight. A single 150g pack delivers 60g of palm fat and 2,050mg sodium, completely exceeding the WHO daily sodium limit.",
        hero_percentage: 0.0,
        filler_percentage: 84.0,
        coverage_percentage: 96.0,
        fssai_disclosure: "Under FSSAI Regulations, declared ingredients (Potatoes 44%, Besan 12%) are statutory QUID declarations. Edible Palmolein Oil is derived from the printed 40g fat per 100g. Spices and moth flour form the remaining bracket.",
        descending_ingredients: [
          "Potatoes (Aloo) (44%)",
          "Edible Vegetable Oil (Palmolein Oil)",
          "Gram Pulse Flour (Besan) (12%)",
          "Tepary Bean Flour (Moth Dal)",
          "Iodised Salt",
          "Mixed Spices (Red Chilli, Pepper, Cardamom, Mint)",
          "Acidity Regulator (INS 330)"
        ],
        undeclared_ingredients: ["Tepary Bean Flour (Moth Dal)", "Iodised Salt", "Mixed Spices", "Acidity Regulator (INS 330)"],
        shares: [
          { name: "Potatoes (Aloo)", percentage: 44.0, is_estimated: false, source: "declared", category: "flour_grain", color_hint: "#3b82f6" },
          { name: "Edible Palmolein Oil (Deep Frying)", percentage: 40.0, is_estimated: true, source: "nutrition_derived", category: "fat_oil", color_hint: "#f59e0b" },
          { name: "Gram Pulse Flour (Besan)", percentage: 12.0, is_estimated: false, source: "declared", category: "flour_grain", color_hint: "#60a5fa" },
          { name: "Undeclared Moth Flour, Spices & Salt", percentage: 4.0, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
        ],
      },
      natural_alternatives: [
        { nutrient: "crunchy savory snack", food_name: "Roasted Phool Makhana", quantity: "30g", nutrient_amount: "Magnesium & light crunch", approx_cost_inr: 25, note: "Non-fried, 80% less calories, zero palm oil." },
        { nutrient: "crunchy savory snack", food_name: "Roasted Black Chana", quantity: "40g", nutrient_amount: "8g protein & 6g fiber", approx_cost_inr: 10, note: "Slow-digesting complex carbs, zero frying." },
      ],
      homemade_recipes: [
        {
          id: "masala_roasted_chana",
          name: "Spiced Roasted Chana Crunch",
          category: "savory_snack",
          dietary_type: "veg",
          prep_time_minutes: 5,
          target_craving: "Fried chips, bhujia or crunchy namkeen craving",
          hero_ingredients: ["Roasted Black Chana", "Mustard Oil (few drops)", "Chaat Masala", "Roasted Jeera", "Amchur"],
          instructions: "Warm roasted chana in a pan with 3-4 drops mustard oil, sprinkle chaat masala, roasted jeera, and dry mango powder. Toss for 1 minute.",
          why_better: "19g protein & 15g fiber per 100g, 95% less fat than deep-fried palmolein bhujia, zero TBHQ chemical antioxidant (INS 319).",
          approx_cost_inr: 10.0,
        },
        {
          id: "tawa_poha_chivda",
          name: "Tawa Roasted Poha Chivda",
          category: "savory_snack",
          dietary_type: "veg",
          prep_time_minutes: 8,
          target_craving: "Mixture, namkeen or potato chips craving",
          hero_ingredients: ["Thin Poha (Flattened Rice)", "Peanuts", "Curry Leaves", "Turmeric (Haldi)", "Green Chili"],
          instructions: "Dry roast thin poha on a wide tawa until crisp. In 1 tsp oil, splutter mustard seeds, curry leaves, green chilies, and peanuts with turmeric. Toss poha together with salt.",
          why_better: "Light and easy to digest; uses fresh peanuts and heart-healthy home oil instead of repeatedly heated industrial palm oil.",
          approx_cost_inr: 8.0,
        },
        {
          id: "masala_egg_bhurji_toast",
          name: "Desi Masala Egg Toast",
          category: "savory_snack",
          dietary_type: "egg",
          prep_time_minutes: 7,
          target_craving: "Savory fried snack or instant noodles craving",
          hero_ingredients: ["2 Eggs", "Onion & Tomato", "Green Chili", "Coriander", "Whole Wheat Bread"],
          instructions: "Sauté chopped onion, tomato, and green chili for 2 minutes. Whisk in 2 eggs with salt and turmeric, scramble softly, and serve over toasted atta bread.",
          why_better: "14g high-biological-value protein and essential choline. Satiating meal that stops snack binging.",
          approx_cost_inr: 20.0,
        },
      ],
    },
  },
  {
    label: "Fruit drink",
    analysis: {
      ...DEMO_AUDIT,
      extraction: {
        product_name: "Real Mango Fruit Drink",
        brand: "Dabur",
        product_category: "beverage_juice",
        nutrition_per_serving: {
          serving_size_g: 200,
          servings_per_package: 1,
          energy_kcal: 132,
          protein_g: 0.4,
          carbohydrates_g: 32.6,
          sugar_g: 27,
          added_sugar_g: 19,
          total_fat_g: 0,
          sodium_mg: 18,
        },
        ingredients: [
          { name: "Water" },
          { name: "Mango Pulp (12%)" },
          { name: "Sugar" },
          { name: "Acidity Regulator (INS 330)" },
          { name: "Antioxidant (INS 300 - Vitamin C)" },
          { name: "Stabilizer (INS 440)" },
        ],
        claims: ["Made with Real Mango", "Rich in Vitamin C", "No Added Preservatives"],
      },
      product_category: "beverage_juice",
      category_display_name: "Fruit Juice & Nectar",
      health_score: 3,
      one_line_summary: "Contains real mango pulp, but only 12%; 86.8% is water and 19g added liquid sugars.",
      detailed_summary: "Front packaging features large ripe mangoes with 'Real Fruit' branding, but mango pulp constitutes only 12% by weight. The remaining 88% is tap water, 19g added white sugar, and stabilizers. Boxed fruit drinks lack the intact dietary fiber of whole fruit, provoking sudden glucose spikes.",
      claim_verifications: [
        { claim: "Made with Real Mango", status: "verified", explanation: "Contains real mango pulp, but only 12%. The primary ingredient by weight is water, supplemented by 19g added sugar.", fssai_rule: "FSSAI QUID verification" },
        { claim: "Rich in Vitamin C", status: "verified", explanation: "Contains synthetic ascorbic acid (INS 300) added back during processing.", fssai_rule: "Nutrient fortification claim" },
        { claim: "No Added Preservatives", status: "verified", explanation: "Aseptic Tetra Pak packaging enables shelf life without chemical preservatives like sodium benzoate.", fssai_rule: "FSSAI Preservative Standard" },
      ],
      price_analysis: undefined,
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "Packaging highlights 'Real Mango', but mango pulp makes up only 12.0%. The rest is 73.5% water and 13.5% added liquid sugar (19g added sugar in this single small pack).",
        hero_percentage: 12.0,
        filler_percentage: 13.5,
        coverage_percentage: 25.5,
        fssai_disclosure: "Under FSSAI Regulations, Mango Pulp (12%) is declared under statutory QUID rules. Sugar (13.5%) is derived from the nutrition table. (listed first, largest by weight) and micro-stabilizers make up the rest.",
        descending_ingredients: [
          "Water",
          "Mango Pulp (12%)",
          "Sugar",
          "Acidity Regulator (INS 330)",
          "Antioxidant (INS 300 - Vitamin C)",
          "Stabilizer (INS 440 - Pectin)"
        ],
        undeclared_ingredients: ["Acidity Regulator (INS 330)", "Antioxidant (INS 300)", "Stabilizer (INS 440)"],
        shares: [
          { name: "Water (Liquid Base)", percentage: 73.5, is_estimated: true, source: "nutrition_derived", category: "beverage_base", color_hint: "#06b6d4" },
          { name: "Added Refined Sugar", percentage: 13.5, is_estimated: true, source: "nutrition_derived", category: "sweetener", color_hint: "#ef4444" },
          { name: "Mango Pulp", percentage: 12.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#10b981" },
          { name: "Undeclared Stabilizers (INS 440) & Vitamin C", percentage: 1.0, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
        ],
      },
      natural_alternatives: [
        { nutrient: "real fruit hydration", food_name: "Whole Fresh Mango / Orange", quantity: "1 fruit (150g)", nutrient_amount: "Intact dietary fiber & bioflavonoids", approx_cost_inr: 20, note: "Slow-release energy with natural pectin fiber." },
        { nutrient: "real fruit hydration", food_name: "Fresh Coconut Water", quantity: "200ml", nutrient_amount: "Natural electrolytes", approx_cost_inr: 45, note: "Zero added sugar." },
      ],
      homemade_recipes: [
        {
          id: "whole_fruit_citrus_slush",
          name: "Fiber-Rich Orange & Mint Slush",
          category: "beverage_juice",
          dietary_type: "veg",
          prep_time_minutes: 5,
          target_craving: "Packaged fruit juice or mango drink craving",
          hero_ingredients: ["Whole Sweet Orange / Mosambi", "Fresh Mint", "Ice Cubes", "Black Salt"],
          instructions: "Peel whole orange, deseed, and blend directly with fresh mint leaves, ice cubes, and a pinch of black salt. DO NOT strain the pulp.",
          why_better: "Keeps the natural citrus pectin and soluble fiber intact, preventing the rapid insulin spike caused by strained commercial fruit drinks.",
          approx_cost_inr: 15.0,
        },
        {
          id: "watermelon_lime_cooler",
          name: "Fresh Watermelon Lime Cooler",
          category: "beverage_juice",
          dietary_type: "veg",
          prep_time_minutes: 4,
          target_craving: "Sweet packaged juice or nectar",
          hero_ingredients: ["Fresh Watermelon Chunks", "Lime Juice", "Pinch Chaat Masala", "Mint Leaves"],
          instructions: "Blend chilled watermelon cubes with a squeeze of fresh lime and a pinch of chaat masala. Serve immediately unstrained.",
          why_better: "100% natural fruit hydration, zero high-fructose corn syrup, rich in natural lycopene and potassium.",
          approx_cost_inr: 12.0,
        },
      ],
    },
  },
  {
    label: "Ketchup sugar",
    analysis: {
      ...DEMO_AUDIT,
      extraction: {
        product_name: "Kissan Fresh Tomato Ketchup",
        brand: "Kissan (HUL)",
        product_category: "condiment_sauce",
        nutrition_per_serving: {
          serving_size_g: 15,
          servings_per_package: 20,
          energy_kcal: 18,
          protein_g: 0.2,
          carbohydrates_g: 4.2,
          sugar_g: 3.8,
          added_sugar_g: 3.5,
          total_fat_g: 0,
          sodium_mg: 140,
        },
        ingredients: [
          { name: "Water" },
          { name: "Tomato Paste (26%)" },
          { name: "Sugar" },
          { name: "Iodised Salt" },
          { name: "Acidity Regulator (INS 260 - Acetic Acid)" },
          { name: "Thickeners (INS 1422 - Modified Starch, INS 415 - Xanthan Gum)" },
          { name: "Onion Powder" },
          { name: "Garlic Powder" },
          { name: "Preservative (INS 211 - Sodium Benzoate)" },
          { name: "Mixed Spices" },
        ],
        claims: ["100% Real Juicy Tomatoes", "Classic Sweet & Tangy"],
      },
      product_category: "condiment_sauce",
      category_display_name: "Condiment & Sauce",
      health_score: 5,
      one_line_summary: "Over 25% of this ketchup is pure refined sugar, with 140mg sodium in just one tablespoon.",
      detailed_summary: "Commercial ketchup is secretly a high-sugar dessert masquerading as a savory condiment. 25.0% of the entire bottle is pure sugar. Two tablespoons contain ~8g sugar (equivalent to 2 sugar cubes), heavily masked by vinegar acidity and sodium.",
      claim_verifications: [
        { claim: "100% Real Juicy Tomatoes", status: "misleading", explanation: "Contains real tomato paste, but at only 26%. The first ingredient by weight is water, and the second largest solid is added white sugar (25%).", fssai_rule: "FSSAI Misleading Ingredient Representation" },
        { claim: "Classic Sweet & Tangy", status: "verified", explanation: "Taste profile produced by combining 25% sugar with acetic acid (INS 260) and salt.", fssai_rule: "Standard flavour description" },
      ],
      price_analysis: undefined,
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "1/4th of this bottle is pure white sugar (25.0%). In fact, 2 tablespoons have more sugar (8g) than a sweet biscuit, heavily disguised by high salt and vinegar acid.",
        hero_percentage: 26.0,
        filler_percentage: 25.0,
        coverage_percentage: 51.0,
        fssai_disclosure: "Under FSSAI Regulations, Tomato Paste (26%) is declared under statutory QUID rules. Sugar (25%) is derived from the nutrition panel. (listed first, largest by weight) and thickeners form the remaining bulk.",
        descending_ingredients: [
          "Water",
          "Tomato Paste (26%)",
          "Sugar",
          "Iodised Salt",
          "Acidity Regulator (INS 260 - Acetic Acid)",
          "Thickeners (INS 1422, INS 415)",
          "Preservative (INS 211 - Sodium Benzoate)"
        ],
        undeclared_ingredients: ["Iodised Salt", "Acidity Regulator (INS 260)", "Thickeners (INS 1422, INS 415)", "Preservative (INS 211)"],
        shares: [
          { name: "Water (Liquid Base)", percentage: 46.0, is_estimated: true, source: "nutrition_derived", category: "beverage_base", color_hint: "#06b6d4" },
          { name: "Tomato Paste", percentage: 26.0, is_estimated: false, source: "declared", category: "hero_ingredient", color_hint: "#ef4444" },
          { name: "Added Refined Sugar", percentage: 25.0, is_estimated: true, source: "nutrition_derived", category: "sweetener", color_hint: "#f97316" },
          { name: "Undeclared Salt, Thickeners & INS 211", percentage: 3.0, is_estimated: true, source: "fssai_undeclared_bracket", category: "undeclared_group", color_hint: "#94a3b8" },
        ],
      },
      natural_alternatives: [
        { nutrient: "tangy dip", food_name: "Fresh Charred Tomato Salsa", quantity: "2 tbsp (30g)", nutrient_amount: "High cooked lycopene & zero sugar", approx_cost_inr: 8, note: "Fresh tomatoes, garlic, and green chili; no preservatives." },
        { nutrient: "tangy dip", food_name: "Mint-Coriander Chutney", quantity: "2 tbsp (30g)", nutrient_amount: "Vitamin C & digestive herbs", approx_cost_inr: 6, note: "Zero added sugar, live fresh chlorophyll." },
      ],
      homemade_recipes: [
        {
          id: "charred_tomato_garlic_chutney",
          name: "Charred Tomato Garlic Chutney",
          category: "condiment_sauce",
          dietary_type: "veg",
          prep_time_minutes: 8,
          target_craving: "Bottled tomato ketchup or synthetic dipping sauce",
          hero_ingredients: ["2 Ripe Tomatoes", "3 Garlic Cloves", "Green Chili", "Mustard Oil (1/2 tsp)", "Salt"],
          instructions: "Roast whole tomatoes and garlic cloves directly on an open flame until the skins blister and char. Peel slightly, mash with chopped green chili, salt, and raw mustard oil.",
          why_better: "Commercial ketchup is 25-30% pure sugar; this homemade version has zero added sugar, high cooked lycopene, and robust fresh flavor.",
          approx_cost_inr: 8.0,
        },
        {
          id: "pudina_dahi_dip",
          name: "Fresh Mint-Coriander Dahi Dip",
          category: "condiment_sauce",
          dietary_type: "veg",
          prep_time_minutes: 4,
          target_craving: "Bottled mayonnaise, cheese dip, or processed dressings",
          hero_ingredients: ["Thick Dahi / Greek Yogurt", "Fresh Mint & Coriander", "Green Chili", "Garlic", "Rock Salt"],
          instructions: "Blend fresh mint, coriander, garlic, and green chili with 1 tbsp water. Stir into 1/2 cup thick fresh curd with rock salt and roasted cumin.",
          why_better: "Commercial mayo is 70% refined soybean oil and water; this dip provides live probiotics, calcium, and fresh plant polyphenols.",
          approx_cost_inr: 12.0,
        },
      ],
    },
  },
];

function IngredientDonutChart({ breakdown }: { breakdown?: IngredientBreakdown }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!breakdown || !breakdown.shares || breakdown.shares.length === 0) return null;

  const shares = breakdown.shares;
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  let accumulatedPercent = 0;
  const activeIndex = hoveredIndex !== null ? hoveredIndex : 0;
  const activeShare = shares[activeIndex] || shares[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-indigo-600" />
          What You're Actually Consuming (100% Ingredient Breakdown)
        </h3>
        <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-full w-fit">
          FSSAI QUID + Macro Reconstruction
        </span>
      </div>

      {breakdown.has_hero_trap && breakdown.hero_insight && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50/80 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-amber-900 block mb-0.5">
              Hero Ingredient Illusion Caught
            </span>
            <p className="text-xs sm:text-sm text-amber-950 leading-relaxed font-medium">
              {breakdown.hero_insight}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* SVG Donut */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-48 h-48 sm:w-56 sm:h-56">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-slate-100 fill-none"
                strokeWidth="14"
              />
              {shares.map((share, idx) => {
                const strokeDasharray = `${(share.percentage / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                accumulatedPercent += share.percentage;
                const isHovered = hoveredIndex === idx;

                return (
                  <circle
                    key={idx}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={share.color_hint || "#64748b"}
                    strokeWidth={isHovered ? 18 : 14}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })}
            </svg>

            {/* Center Label inside Donut Hole */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400">
                {activeShare.category === "hero_ingredient"
                  ? "Hero Ingredient"
                  : activeShare.category === "sweetener"
                  ? "Sweetener"
                  : activeShare.category === "fat_oil"
                  ? "Edible Fat"
                  : activeShare.category === "undeclared_group"
                  ? "Undeclared Group"
                  : activeShare.category === "flour_grain"
                  ? "Base Flour"
                  : activeShare.category === "beverage_base"
                  ? "Liquid Base"
                  : "Ingredient"}
              </span>
              <span className="text-3xl font-extrabold text-slate-900 leading-tight">
                {activeShare.percentage}%
              </span>
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">
                {activeShare.name}
              </span>
              <span className="text-[9px] text-slate-400 font-medium mt-0.5">
                {activeShare.source === "declared"
                  ? "Declared QUID"
                  : activeShare.source === "nutrition_derived"
                  ? "Derived from Nutrition Panel"
                  : "FSSAI Undeclared Bracket"}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-2 text-center">
            Hover over slices to inspect each ingredient
          </span>
        </div>

        {/* Legend / Breakdown List */}
        <div className="md:col-span-7 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-2 pb-1 border-b border-slate-100">
            <span>Ingredient & Group</span>
            <span>Share (% by wt)</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {shares.map((share, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-between text-xs ${
                    isHovered
                      ? "bg-slate-50 border-slate-400 shadow-xs"
                      : "bg-white border-slate-200/80 hover:bg-slate-50/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span
                      className="w-3.5 h-3.5 rounded-md flex-shrink-0"
                      style={{ backgroundColor: share.color_hint || "#64748b" }}
                    />
                    <div className="truncate">
                      <span className="font-bold text-slate-900 block truncate">
                        {share.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                            share.source === "declared"
                              ? "bg-emerald-100 text-emerald-800"
                              : share.source === "nutrition_derived"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {share.source === "declared"
                            ? "Declared QUID"
                            : share.source === "nutrition_derived"
                            ? "Derived from Nutrition"
                            : "Grouped Undeclared Bracket"}
                        </span>
                        {share.category === "hero_ingredient" && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            Advertised Hero
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-extrabold text-slate-900">
                      {share.percentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Declared & Derived Coverage: <strong>{breakdown.coverage_percentage}%</strong></span>
            <span>Total Sum: <strong>100%</strong></span>
          </div>
        </div>
      </div>

      {/* FSSAI Statutory Rule & Descending Order of Weight */}
      <div className="mt-6 pt-5 border-t border-slate-200/80">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/90">
          <div className="flex items-start gap-2.5 mb-2">
            <BookOpen className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Why are some ingredients grouped? (FSSAI Descending Order Rule)
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                {breakdown.fssai_disclosure ||
                  "Under FSSAI Regulations, companies are only required to declare percentages for characterizing hero ingredients. Remaining ingredients are legally mandated to appear in descending order of weight. LabelPadho groups undeclared items rather than guessing fake percentages."}
              </p>
            </div>
          </div>

          {breakdown.descending_ingredients && breakdown.descending_ingredients.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-500 block mb-2">
                Statutory Order of Ingredients (By Weight on Package):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {breakdown.descending_ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                  >
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded">
                      {i + 1}
                    </span>
                    {ing}
                    {i === 0 && (
                      <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded">
                        Highest Wt
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DietaryBadge({ type }: { type: "veg" | "egg" | "non_veg" }) {
  if (type === "veg") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-[11px] font-bold text-emerald-800">
        <span className="w-2.5 h-2.5 border-2 border-emerald-600 flex items-center justify-center p-0.5 rounded-xs">
          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
        </span>
        Pure Veg
      </span>
    );
  }
  if (type === "egg") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900">
        <span className="w-2.5 h-2.5 border-2 border-amber-600 flex items-center justify-center p-0.5 rounded-xs">
          <span className="w-1.5 h-1.5 bg-amber-600 rounded-full" />
        </span>
        Contains Egg
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-50 border border-red-300 text-[11px] font-bold text-red-900">
      <span className="w-2.5 h-2.5 border-2 border-red-600 flex items-center justify-center p-0.5 rounded-xs">
        <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
      </span>
      Non-Veg
    </span>
  );
}

function HomemadeRecipesCard({ recipes }: { recipes?: HomemadeRecipe[] }) {
  if (!recipes || recipes.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-600" />
            Quick Homemade Swaps (5–12 Min Indian Kitchen Recipes)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Beat packaged ultra-processed cravings with zero palm oil, real ingredients, and kitchen staples.
          </p>
        </div>
        <span className="text-xs text-amber-800 font-semibold bg-amber-100/70 border border-amber-200 px-2.5 py-1 rounded-full w-fit flex items-center gap-1">
          🇮🇳 Indian Kitchen Swaps
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <DietaryBadge type={recipe.dietary_type} />
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {recipe.prep_time_minutes} mins
                </span>
              </div>

              <h4 className="font-bold text-slate-900 text-sm mb-1 leading-snug">
                {recipe.name}
              </h4>

              <p className="text-[11px] text-amber-900/80 font-medium bg-amber-50/60 rounded px-2 py-0.5 mb-2.5">
                Replaces: {recipe.target_craving}
              </p>

              {recipe.hero_ingredients && recipe.hero_ingredients.length > 0 && (
                <div className="mb-3">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">
                    Kitchen Ingredients
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {recipe.hero_ingredients.map((ing, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-700 leading-relaxed mb-3">
                {recipe.instructions}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200/60 mt-auto">
              <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-100 text-[11px] text-emerald-950 font-medium leading-relaxed">
                <strong className="text-emerald-800">Why it beats packaged: </strong>
                {recipe.why_better}
              </div>
              <div className="mt-2 text-right">
                <span className="text-[11px] font-bold text-slate-700">
                  Estimated Cost: ~₹{recipe.approx_cost_inr.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// Shared helpers for profiles & compare
// ============================================================

const NUTRIENT_KEYS = [
  "energy_kcal", "protein_g", "carbohydrates_g", "sugar_g", "added_sugar_g",
  "total_fat_g", "saturated_fat_g", "trans_fat_g", "sodium_mg", "fiber_g",
] as const;
type NutrientKey = (typeof NUTRIENT_KEYS)[number];

// Per-100g values: the label's per-100g column if present, else scaled from the serving
function per100(a: ProductAnalysis): Partial<Record<NutrientKey, number>> {
  const p100 = a.extraction.nutrition_per_100g;
  const out: Partial<Record<NutrientKey, number>> = {};
  if (p100 && NUTRIENT_KEYS.some((k) => p100[k] != null)) {
    NUTRIENT_KEYS.forEach((k) => {
      if (p100[k] != null) out[k] = p100[k] as number;
    });
    return out;
  }
  const s = a.extraction.nutrition_per_serving;
  if (s?.serving_size_g) {
    const f = 100 / s.serving_size_g;
    NUTRIENT_KEYS.forEach((k) => {
      if (s[k] != null) out[k] = (s[k] as number) * f;
    });
  }
  return out;
}

const ingredientText = (a: ProductAnalysis) => a.extraction.ingredients.map((i) => i.name.toLowerCase()).join(" | ");
const hasAny = (text: string, words: string[]) => words.filter((w) => text.includes(w));

// ============================================================
// Health profiles — "Is this OK for me?"
// ============================================================

type ProfileId = "diabetic" | "bp" | "gym" | "kids" | "pregnancy";
const PROFILES: { id: ProfileId; label: string }[] = [
  { id: "diabetic", label: "Diabetic / sugar control" },
  { id: "bp", label: "High BP / heart" },
  { id: "gym", label: "Gym / high protein" },
  { id: "kids", label: "For kids" },
  { id: "pregnancy", label: "Pregnancy" },
];

type Insight = { level: "good" | "caution" | "avoid"; text: string };

// Thresholds: WHO sugar/sodium guidance, UK FSA traffic-light bands per 100g,
// FSSAI "source/high" protein & fibre claims. General guidance only.
function profileInsights(a: ProductAnalysis, profile: ProfileId): Insight[] {
  const n = per100(a);
  const ing = ingredientText(a);
  const isDrink = a.product_category === "beverage_soda" || a.product_category === "beverage_juice";
  const unit = isDrink ? "100ml" : "100g";
  const out: Insight[] = [];
  const sugar = n.sugar_g, sodium = n.sodium_mg, protein = n.protein_g, fibre = n.fiber_g, kcal = n.energy_kcal;
  const sweeteners = hasAny(ing, ["aspartame", "sucralose", "acesulfame", "saccharin", "ins 951", "ins 955", "ins 950", "ins 954"]);
  const colours = hasAny(ing, ["ins 102", "ins 110", "ins 122", "ins 124", "ins 129", "ins 133", "tartrazine", "sunset yellow", "carmoisine", "ponceau", "allura"]);
  const caffeine = ing.includes("caffeine") || ing.includes("coffee") || a.product_category === "beverage_soda";

  if (profile === "diabetic") {
    const sugarHigh = isDrink ? 5 : 12.5;
    if (sugar != null) {
      if (sugar > sugarHigh * 1.8) out.push({ level: "avoid", text: `Very high sugar: ${sugar.toFixed(1)}g per ${unit}. Likely to spike blood glucose.` });
      else if (sugar > sugarHigh) out.push({ level: "caution", text: `High sugar: ${sugar.toFixed(1)}g per ${unit}. Keep portions small.` });
      else if (sugar <= 5) out.push({ level: "good", text: `Low sugar: ${sugar.toFixed(1)}g per ${unit}.` });
    }
    const refined = hasAny(ing.split(" | ").slice(0, 3).join(" "), ["maida", "refined wheat flour", "glucose", "maltodextrin", "corn syrup"]);
    if (refined.length) out.push({ level: "caution", text: `Fast-digesting refined carbs among the main ingredients (${refined.join(", ")}).` });
    if (fibre != null && fibre >= 3) out.push({ level: "good", text: `Has fibre (${fibre.toFixed(1)}g per ${unit}), which slows sugar absorption.` });
    if (sweeteners.length) out.push({ level: "caution", text: `Uses artificial sweeteners (${sweeteners.join(", ")}). "Sugar-free" isn't automatically safe in large amounts.` });
  }

  if (profile === "bp") {
    if (sodium != null) {
      const high = isDrink ? 300 : 600, med = isDrink ? 150 : 300;
      if (sodium > high) out.push({ level: "avoid", text: `High sodium: ${sodium.toFixed(0)}mg per ${unit} (WHO limit is 2,000mg a day).` });
      else if (sodium > med) out.push({ level: "caution", text: `Moderate sodium: ${sodium.toFixed(0)}mg per ${unit}. Count it in your daily 2,000mg.` });
      else out.push({ level: "good", text: `Low sodium: ${sodium.toFixed(0)}mg per ${unit}.` });
    }
    if (hasAny(ing, ["ins 621", "monosodium glutamate", "msg"]).length) out.push({ level: "caution", text: "Contains MSG (INS 621), an extra source of sodium." });
    if (n.saturated_fat_g != null && n.saturated_fat_g > 5) out.push({ level: "caution", text: `Saturated fat ${n.saturated_fat_g.toFixed(1)}g per ${unit}, not great for heart health.` });
    if ((n.trans_fat_g ?? 0) > 0.2) out.push({ level: "avoid", text: "Contains trans fat, the worst fat for your heart." });
  }

  if (profile === "gym") {
    if (protein != null) {
      const per100kcal = kcal ? (protein / kcal) * 100 : null;
      if (protein >= 20) out.push({ level: "good", text: `High protein: ${protein.toFixed(1)}g per ${unit}.` });
      else if (protein >= 10) out.push({ level: "caution", text: `Some protein (${protein.toFixed(1)}g per ${unit}), but not a real protein source.` });
      else out.push({ level: "avoid", text: `Low protein: ${protein.toFixed(1)}g per ${unit}. Won't help your protein target.` });
      if (per100kcal != null) {
        out.push({
          level: per100kcal >= 8 ? "good" : per100kcal >= 4 ? "caution" : "avoid",
          text: `${per100kcal.toFixed(1)}g protein per 100 kcal ${per100kcal >= 8 ? "(lean)" : "(mostly carbs and fat calories)"}.`,
        });
      }
    }
    if (a.price_analysis?.price_per_g_protein) out.push({ level: a.price_analysis.price_per_g_protein <= 2 ? "good" : "caution", text: `₹${a.price_analysis.price_per_g_protein.toFixed(2)} per gram of protein (eggs and chana cost about ₹1 to ₹1.5).` });
    if (sugar != null && sugar > 10 && a.product_category === "protein_fitness") out.push({ level: "caution", text: `"Protein" product with ${sugar.toFixed(1)}g sugar per ${unit}.` });
  }

  if (profile === "kids") {
    if (colours.length) out.push({ level: "avoid", text: `Artificial colours (${colours.join(", ")}). These are linked to hyperactivity in children and need a warning label in the EU.` });
    if (sweeteners.length) out.push({ level: "avoid", text: `Artificial sweeteners (${sweeteners.join(", ")}) are not recommended for young children.` });
    if (caffeine) out.push({ level: "avoid", text: "May contain caffeine. Not suitable for children." });
    if (sugar != null) {
      const high = isDrink ? 5 : 12.5;
      if (sugar > high) out.push({ level: "caution", text: `${sugar.toFixed(1)}g sugar per ${unit}. WHO suggests children keep added sugar under about 25g a day.` });
      else out.push({ level: "good", text: `Low sugar (${sugar.toFixed(1)}g per ${unit}).` });
    }
  }

  if (profile === "pregnancy") {
    if (caffeine) out.push({ level: "caution", text: "May contain caffeine. Keep total caffeine under 200mg a day in pregnancy." });
    if (hasAny(ing, ["saccharin", "ins 954"]).length) out.push({ level: "avoid", text: "Contains saccharin, best avoided during pregnancy." });
    if (sodium != null && sodium > 600) out.push({ level: "caution", text: `High sodium (${sodium.toFixed(0)}mg per ${unit}) can worsen swelling and BP.` });
    if (fibre != null && fibre >= 3) out.push({ level: "good", text: `Fibre (${fibre.toFixed(1)}g per ${unit}) helps with digestion.` });
    if (protein != null && protein >= 10) out.push({ level: "good", text: `Good protein (${protein.toFixed(1)}g per ${unit}).` });
  }

  if (out.length === 0) out.push({ level: "good", text: "Nothing specific to flag for this profile based on the label." });
  return out;
}

function ProfileCard({ analysis, profile, onChange }: { analysis: ProductAnalysis; profile: ProfileId | null; onChange: (p: ProfileId | null) => void }) {
  const insights = profile ? profileInsights(analysis, profile) : [];
  const verdict = insights.some((i) => i.level === "avoid") ? "avoid" : insights.some((i) => i.level === "caution") ? "caution" : "good";
  const verdictUi = {
    good: { text: "Looks OK for you", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    caution: { text: "Okay occasionally, in small portions", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    avoid: { text: "Better to avoid", cls: "bg-red-50 text-red-800 border-red-200" },
  }[verdict];
  const dot = { good: "bg-emerald-500", caution: "bg-amber-500", avoid: "bg-red-500" };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
        <UserRound className="w-5 h-5 text-indigo-600" />
        Is this OK for me?
      </h3>
      <p className="text-xs text-slate-500 mb-3">Pick one to see what matters for you.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(profile === p.id ? null : p.id)}
            aria-pressed={profile === p.id}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition cursor-pointer ${
              profile === p.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {profile && (
        <>
          <div className={`text-sm font-bold px-3 py-2 rounded-lg border mb-3 ${verdictUi.cls}`}>{verdictUi.text}</div>
          <ul className="space-y-2">
            {insights.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot[i.level]}`} />
                {i.text}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-3">General guidance from the label, not medical advice. Check with your doctor for your own needs.</p>
        </>
      )}
    </div>
  );
}

// ============================================================
// Score breakdown — "Why this score?"
// ============================================================

function ScoreBreakdown({ factors, basis }: { factors?: ScoreFactor[]; basis?: string }) {
  if (!factors || factors.length === 0) return null;
  return (
    <details className="mt-3 text-left group">
      <summary className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer list-none flex items-center justify-center gap-1">
        Why this score? <span className="group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <ul className="mt-2 space-y-1 min-w-[220px] max-w-xs">
        <li className="flex justify-between gap-3 text-[11px] text-slate-500 border-b border-slate-200 pb-1">
          <span>Starting score</span>
          <span className="font-semibold">7</span>
        </li>
        {factors.map((f, i) => (
          <li key={i} className="flex justify-between gap-3 text-[11px]">
            <span className="text-slate-700">{f.label}</span>
            <span className={`font-bold shrink-0 ${f.points < 0 ? "text-red-600" : "text-emerald-700"}`}>
              {f.points > 0 ? "+" : ""}
              {f.points}
            </span>
          </li>
        ))}
        {basis && <li className="text-[10px] text-slate-400 pt-1">Judged {basis}, so serving-size tricks don&apos;t change it.</li>}
      </ul>
    </details>
  );
}

// ============================================================
// Share — one button, menu with WhatsApp / copy link / more
// ============================================================

function ShareMenu({ analysis }: { analysis: ProductAnalysis }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!analysis.scan_id) return null;
  const scanId = analysis.scan_id;
  const title = productTitle(analysis.extraction.brand, analysis.extraction.product_name, analysis.extraction.variant);
  const text = `${title} scores ${analysis.health_score ?? "?"}/10 on LabelPadho: ${analysis.one_line_summary}`;
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  const copy = async () => {
    track("share", { product_id: scanId, detail: "copy_link" });
    try {
      await navigator.clipboard.writeText(shareUrl(scanId, "copied_link"));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      /* clipboard blocked */
    }
  };
  const more = async () => {
    setOpen(false);
    track("share", { product_id: scanId, detail: "native" });
    try {
      await navigator.share({ title, text, url: shareUrl(scanId, "native_share") });
    } catch {
      /* cancelled */
    }
  };

  const item = "w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
      >
        <Share2 className="w-3.5 h-3.5" /> Share
      </button>
      {open && (
        <div role="menu" className="absolute z-20 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          <a
            role="menuitem"
            href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl(scanId, "whatsapp")}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track("share", { product_id: scanId, detail: "whatsapp" });
              setOpen(false);
            }}
            className={item}
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" /> WhatsApp
          </a>
          <button role="menuitem" type="button" onClick={copy} className={item}>
            <Link2 className="w-4 h-4" /> {copied ? "Link copied!" : "Copy link"}
          </button>
          {canNativeShare && (
            <button role="menuitem" type="button" onClick={more} className={item}>
              <Share2 className="w-4 h-4" /> More options...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Report wrong data
// ============================================================

const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "wrong_name", label: "Wrong product name" },
  { id: "wrong_nutrition", label: "Wrong nutrition numbers" },
  { id: "wrong_ingredients", label: "Wrong ingredients" },
  { id: "wrong_claims", label: "Claims checked wrongly" },
  { id: "other", label: "Something else" },
];

function ReportWrongData({ scanId, initialCount }: { scanId: number; initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("wrong_nutrition");
  const [details, setDetails] = useState("");
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCount(initialCount);
    setStatus("idle");
    setOpen(false);
  }, [scanId, initialCount]);

  const submit = async () => {
    setStatus("sending");
    try {
      const res = await fetch(`${API_BASE}/api/history/${scanId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not send report");
      setCount(data.report_count);
      setStatus("sent");
      track("report_wrong_data", { product_id: scanId, detail: reason });
      setOpen(false);
    } catch (e: any) {
      setMessage(e.message);
      setStatus("error");
    }
  };

  return (
    <div className="text-xs">
      {count > 0 && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-2 inline-flex items-center gap-1.5">
          <Flag className="w-3.5 h-3.5" /> {count} {count === 1 ? "person has" : "people have"} reported possible errors in this report
        </p>
      )}
      {status === "sent" ? (
        <p className="text-emerald-700 font-semibold">Thanks! Your report helps keep the catalog accurate.</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-slate-500 hover:text-red-600 font-semibold flex items-center gap-1 cursor-pointer">
          <Flag className="w-3.5 h-3.5" /> Report wrong data
        </button>
      ) : (
        <div className="mt-1 p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2 max-w-md">
          <label className="block font-semibold text-slate-700">
            What&apos;s wrong?
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white font-normal">
              {REPORT_REASONS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block font-semibold text-slate-700">
            Details (optional)
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Pack says 12g sugar, report shows 36g" className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white font-normal" />
          </label>
          {status === "error" && <p className="text-red-600">{message}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={status === "sending"} className="px-3 py-1.5 bg-slate-900 text-white font-semibold rounded-md cursor-pointer disabled:opacity-50">
              {status === "sending" ? "Sending..." : "Send report"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 border border-slate-300 bg-white font-semibold rounded-md cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Compare two products side by side
// ============================================================

type CompareRow = { label: string; get: (a: ProductAnalysis) => number | null | undefined; unit: string; better: "lower" | "higher"; digits?: number };

const COMPARE_ROWS: CompareRow[] = [
  { label: "Health score", get: (a) => a.health_score, unit: "/10", better: "higher", digits: 0 },
  { label: "Energy", get: (a) => per100(a).energy_kcal, unit: " kcal", better: "lower", digits: 0 },
  { label: "Sugar", get: (a) => per100(a).sugar_g, unit: "g", better: "lower" },
  { label: "Sodium", get: (a) => per100(a).sodium_mg, unit: "mg", better: "lower", digits: 0 },
  { label: "Saturated fat", get: (a) => per100(a).saturated_fat_g, unit: "g", better: "lower" },
  { label: "Protein", get: (a) => per100(a).protein_g, unit: "g", better: "higher" },
  { label: "Fibre", get: (a) => per100(a).fiber_g, unit: "g", better: "higher" },
  { label: "Flagged ingredients", get: (a) => a.ingredient_flags.length, unit: "", better: "lower", digits: 0 },
  { label: "Ingredients count", get: (a) => a.extraction.ingredients.length, unit: "", better: "lower", digits: 0 },
  { label: "₹ per g protein", get: (a) => a.price_analysis?.price_per_g_protein, unit: "", better: "lower", digits: 2 },
];

function ComparePanel({ base, onClose }: { base: ProductAnalysis; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<HistoryCard[]>([]);
  const [other, setOther] = useState<ProductAnalysis | null>(null);
  const [loadingOther, setLoadingOther] = useState(false);

  useEffect(() => {
    const qq = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = qq
          ? `${API_BASE}/api/products/search?q=${encodeURIComponent(qq)}&limit=6`
          : `${API_BASE}/api/products/suggestions?limit=6`;
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) setOptions((await res.json()).filter((o: HistoryCard) => o.id !== base.scan_id));
      } catch {
        /* aborted */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, base.scan_id]);

  const pick = async (id: number) => {
    setLoadingOther(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/${id}`);
      if (res.ok) setOther(await res.json());
    } finally {
      setLoadingOther(false);
    }
  };

  const demos = DEMO_AUDITS.filter(({ analysis: d }) => {
    const qq = query.trim().toLowerCase();
    return !qq || `${d.extraction.brand} ${d.extraction.product_name}`.toLowerCase().includes(qq);
  });

  const titleOf = (a: ProductAnalysis) => productTitle(a.extraction.brand, a.extraction.product_name, a.extraction.variant);
  const fmt = (v: number | null | undefined, row: CompareRow) => (v == null ? "—" : `${v.toFixed(row.digits ?? 1)}${row.unit}`);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" /> Compare side by side
        </h3>
        <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close compare">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!other ? (
        <>
          <p className="text-xs text-slate-500 mb-2">Pick a product to compare with {titleOf(base)}:</p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalog..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 mb-2"
          />
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {options.map((o) => (
              <li key={`c-${o.id}`}>
                <button type="button" onClick={() => pick(o.id)} className="w-full text-left px-4 py-2 hover:bg-indigo-50/60 text-sm flex justify-between gap-3 cursor-pointer">
                  <span className="truncate font-medium text-slate-900">{productTitle(o.brand, o.product_name, o.variant)}</span>
                  {o.health_score != null && <span className="text-xs font-bold text-slate-600 shrink-0">{o.health_score}/10</span>}
                </button>
              </li>
            ))}
            {demos.map(({ label, analysis: d }) => (
              <li key={`cd-${label}`}>
                <button type="button" onClick={() => setOther(d)} className="w-full text-left px-4 py-2 hover:bg-indigo-50/60 text-sm flex justify-between gap-3 cursor-pointer">
                  <span className="truncate font-medium text-slate-900">{titleOf(d)}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">Sample</span>
                </button>
              </li>
            ))}
          </ul>
          {loadingOther && <p className="text-xs text-slate-500 mt-2">Loading...</p>}
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Per 100g / 100ml</th>
                  <th className="py-2 px-3 font-semibold text-slate-900">{titleOf(base)}</th>
                  <th className="py-2 pl-3 font-semibold text-slate-900">{titleOf(other)}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => {
                  const a = row.get(base), b = row.get(other);
                  const aWins = a != null && b != null && a !== b && (row.better === "lower" ? a < b : a > b);
                  const bWins = a != null && b != null && a !== b && !aWins;
                  return (
                    <tr key={row.label} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-600">{row.label}</td>
                      <td className={`py-2 px-3 font-semibold ${aWins ? "text-emerald-700 bg-emerald-50/60" : "text-slate-900"}`}>{fmt(a, row)}</td>
                      <td className={`py-2 pl-3 font-semibold ${bWins ? "text-emerald-700 bg-emerald-50/60" : "text-slate-900"}`}>{fmt(b, row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-slate-500">Green = better on that row. Compared per 100g so serving sizes can&apos;t mislead.</p>
            <button type="button" onClick={() => setOther(null)} className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer">Compare another</button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Barcode scanner: live camera, a photo of the barcode, or typed digits.
// Uses the browser's built-in BarcodeDetector where it exists (Chrome on
// Android) and a WebAssembly polyfill elsewhere (iPhone Safari, Firefox).
// ============================================================

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

async function getBarcodeDetector(): Promise<any> {
  const Native = (window as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      if (BARCODE_FORMATS.some((f) => supported.includes(f))) return new Native({ formats: BARCODE_FORMATS });
    } catch {
      /* fall through to the polyfill */
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: BARCODE_FORMATS as any });
}

const firstRetailCode = (codes: any[]) => codes.find((c: any) => /^\d{8,14}$/.test(c.rawValue))?.rawValue as string | undefined;

function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [typed, setTyped] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Live camera isn't available here. Take a photo of the barcode or type the digits.");
        return;
      }
      try {
        const detector = await getBarcodeDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current || stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const value = firstRetailCode(await detector.detect(videoRef.current));
            if (value) {
              onCode(value);
              return;
            }
          } catch {
            /* frame not ready yet */
          }
          timer = setTimeout(tick, 250); // ~4 checks a second is plenty and easy on phones
        };
        tick();
      } catch {
        setCameraError("Camera access was blocked. Take a photo of the barcode or type the digits.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const scanPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoMsg("Reading barcode...");
    try {
      const detector = await getBarcodeDetector();
      const bitmap = await createImageBitmap(file);
      const value = firstRetailCode(await detector.detect(bitmap));
      if (value) onCode(value);
      else setPhotoMsg("Couldn't read a barcode in that photo. Try closer, flatter and in good light, or type the digits.");
    } catch {
      setPhotoMsg("Couldn't read that photo. Please type the digits instead.");
    }
  };

  return (
    <div className="mt-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <ScanBarcode className="w-4 h-4" /> Scan a barcode
        </p>
        <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close barcode scanner">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!cameraError ? (
        <video ref={videoRef} muted playsInline className="w-full max-h-56 object-cover rounded-lg bg-black mb-2" />
      ) : (
        <p className="text-xs text-slate-500 mb-2">{cameraError}</p>
      )}
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer mb-2">
        <Upload className="w-3.5 h-3.5" /> Take a photo of the barcode
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanPhoto(e.target.files?.[0])} />
      </label>
      {photoMsg && <p className="text-xs text-slate-600 mb-2">{photoMsg}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const digits = typed.replace(/\D/g, "");
          if (digits.length >= 8 && digits.length <= 14) onCode(digits);
        }}
        className="flex gap-2"
      >
        <input
          inputMode="numeric"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type the digits, e.g. 8901058851298"
          aria-label="Barcode digits"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button type="submit" className="px-3 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg cursor-pointer">Look up</button>
      </form>
    </div>
  );
}

export default function LabelPadhoApp({
  initialScanId,
  initialAnalysis,
}: { initialScanId?: number; initialAnalysis?: ProductAnalysis | null } = {}) {
  
  // Upload inputs
  const [nutritionFile, setNutritionFile] = useState<File | null>(null);
  const [ingredientsFile, setIngredientsFile] = useState<File | null>(null);
  // Front of pack + any other panels with claims (up to MAX_CLAIM_PHOTOS)
  const [frontFiles, setFrontFiles] = useState<{ file: File; preview: string }[]>([]);
  const [nutritionPreview, setNutritionPreview] = useState<string | null>(null);
  const [ingredientsPreview, setIngredientsPreview] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [expectedConsumption, setExpectedConsumption] = useState("");

  const handleNutritionChange = (file: File | null) => {
    setNutritionFile(file);
    if (file) {
      setNutritionPreview(URL.createObjectURL(file));
    } else {
      setNutritionPreview(null);
    }
  };

  const handleIngredientsChange = (file: File | null) => {
    setIngredientsFile(file);
    if (file) {
      setIngredientsPreview(URL.createObjectURL(file));
    } else {
      setIngredientsPreview(null);
    }
  };

  const addFrontFiles = (files: FileList | null) => {
    if (!files) return;
    setFrontFiles((prev) =>
      [...prev, ...Array.from(files).map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(
        0,
        MAX_CLAIM_PHOTOS
      )
    );
  };

  const removeFrontFile = (index: number) => {
    setFrontFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };
  
  // Loading & states
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Preparing label photos...");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(initialAnalysis ?? null);

  // Analytics: remember the arrival source before the URL is rewritten, then log the visit
  useState(() => {
    if (typeof window !== "undefined") captureArrival();
    return null;
  });
  useEffect(() => {
    track("visit");
  }, []);
  useEffect(() => {
    if (analysis) track("report_view", { product_id: analysis.scan_id ?? null, detail: analysis.scan_id ? null : "sample" });
  }, [analysis]);

  useEffect(() => {
    if (!loading) {
      setLoadingMsg("Preparing label photos...");
      return;
    }
    const t1 = setTimeout(() => setLoadingMsg("Extracting nutrition table & ingredients with Gemini Vision..."), 6000);
    const t2 = setTimeout(() => setLoadingMsg("Checking front-of-pack claims, oils and calorie maths..."), 15000);
    const t3 = setTimeout(() => setLoadingMsg("Synthesizing plain-language verdict (cloud container waking up)..."), 28000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  // Product search (scanner tab) — find an already-audited product instead of re-uploading photos
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<HistoryCard[]>([]);
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  // Latest products in the shared catalog, shown before the user types
  useEffect(() => {
    fetch(`${API_BASE}/api/products/suggestions?limit=6`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, []);

  // Close the dropdown when clicking anywhere else
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const matchingDemos = DEMO_AUDITS.filter(({ analysis: a }) => {
    if (!q) return true;
    const hay = phonetic(`${a.extraction.brand || ""} ${a.extraction.product_name || ""}`);
    return q.split(/\s+/).every((word) => hay.includes(phonetic(word)));
  });

  // Rename (only the person who just scanned holds the token)
  const [editTokens, setEditTokens] = useState<Record<number, string>>({});
  useEffect(() => setEditTokens(loadEditTokens()), []);
  const [renaming, setRenaming] = useState(false);
  const [renameForm, setRenameForm] = useState({ brand: "", product_name: "", variant: "" });
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = () => {
    if (!analysis) return;
    setRenameForm({
      brand: analysis.extraction.brand || "",
      product_name: analysis.extraction.product_name || "",
      variant: analysis.extraction.variant || "",
    });
    setRenameError(null);
    setRenaming(true);
  };

  const saveRename = async () => {
    if (!analysis?.scan_id) return;
    const token = editTokens[analysis.scan_id];
    if (!renameForm.product_name.trim()) {
      setRenameError("Product name can't be empty.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/history/${analysis.scan_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit_token: token, ...renameForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Rename failed");
      setAnalysis({
        ...analysis,
        extraction: { ...analysis.extraction, brand: data.brand, product_name: data.product_name, variant: data.variant },
      });
      setSuggestions((prev) => prev.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      setRenaming(false);
    } catch (err: any) {
      setRenameError(err.message || "Rename failed");
    }
  };

  // Shelf leaderboard: healthier products on the same shelf
  const [alternatives, setAlternatives] = useState<AlternativesResult | null>(null);
  useEffect(() => {
    setAlternatives(null);
    setRenaming(false);
    if (!analysis?.scan_id) return;
    fetch(`${API_BASE}/api/products/${analysis.scan_id}/alternatives`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setAlternatives)
      .catch(() => setAlternatives(null));
  }, [analysis?.scan_id]);

  // Health profile: nothing pre-selected; the shopper picks one per product
  const [profile, setProfile] = useState<ProfileId | null>(null);
  const changeProfile = (p: ProfileId | null) => {
    setProfile(p);
    if (p) track("profile_select", { product_id: analysis?.scan_id ?? null, detail: p });
  };

  // Compare panel
  const [compareOpen, setCompareOpen] = useState(false);

  // Hindi view: translated copy of the current audit (numbers untouched)
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [hindi, setHindi] = useState<ProductAnalysis | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  useEffect(() => {
    setHindi(null);
    setLang("en");
    setTranslateError(null);
    setCompareOpen(false);
  }, [analysis]);

  const toggleHindi = async () => {
    if (!analysis) return;
    if (lang === "hi") {
      setLang("en");
      return;
    }
    track("hindi_toggle", { product_id: analysis.scan_id ?? null });
    if (hindi) {
      setLang("hi");
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis.scan_id ? { scan_id: analysis.scan_id, lang: "hi" } : { analysis, lang: "hi" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Translation failed");
      setHindi(data);
      setLang("hi");
    } catch (e: any) {
      setTranslateError(e.message);
    } finally {
      setTranslating(false);
    }
  };
  const shown = lang === "hi" && hindi ? hindi : analysis;

  // Barcode lookup
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeMsg, setBarcodeMsg] = useState<string | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  // "Add a product" panel: photos are the fallback, not the first thing people see
  const [addOpen, setAddOpen] = useState(false);
  const addRef = React.useRef<HTMLElement>(null);
  const openAdd = (name?: string) => {
    if (name) setProductName(name);
    setAddOpen(true);
    setTimeout(() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  // Live count of products in the shared catalog
  const [productCount, setProductCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/products/count`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && typeof d.count === "number" && setProductCount(d.count))
      .catch(() => {});
  }, [analysis?.scan_id]);
  const lookupBarcode = React.useCallback(async (code: string) => {
    setBarcodeOpen(false);
    setBarcodeMsg(`Looking up ${code}...`);
    try {
      const res = await fetch(`${API_BASE}/api/products/barcode/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Lookup failed");
      track("barcode_lookup", { product_id: data.scan_id ?? null, detail: data.found ? data.source : "not_found" });
      if (data.found && data.scan_id) {
        setBarcodeMsg(data.source === "open_food_facts" ? "Found in Open Food Facts. Report created and added to the catalog." : null);
        setPendingBarcode(null);
        await viewPastScan(data.scan_id);
      } else {
        setPendingBarcode(code);
        setBarcodeMsg("No one has added this product yet. Every product here was added once by someone and saved for everyone. Add this one with a few photos and the next person gets it instantly.");
      }
    } catch (e: any) {
      setBarcodeMsg(e.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchDone(false);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    setSearchLoading(true);
    // Debounce so we only hit the API once the user pauses typing
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/products/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const results = await res.json();
          setSearchResults(results);
          track("search", { detail: q, value: results.length });
        }
        setSearchDone(true);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("Product search failed", e);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const loadDemoAudit = (demo: ProductAnalysis) => {
    setError(null);
    setAnalysis(demo);
    setTimeout(() => {
      scrollToResults();
    }, 100);
  };

  const resultsRef = React.useRef<HTMLElement>(null);
  const scrollToResults = () =>
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);

  const openFromSearch = (open: () => void) => {
    setSearchOpen(false);
    open();
  };

  const viewPastScan = async (scanId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/history/${scanId}`);
      if (!res.ok) throw new Error("Could not load past scan details");
      const pastData: ProductAnalysis = await res.json();
      setAnalysis(pastData);
        scrollToResults();
    } catch (err: any) {
      setError(err.message || "Could not open that report");
    } finally {
      setLoading(false);
    }
  };

  // Shared link (/p/123): open that audit on load
  useEffect(() => {
    // The server already sent the report for /p/<id>; only fetch if it couldn't
    if (initialScanId && !initialAnalysis) viewPastScan(initialScanId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScanId]);

  // Keep the address bar shareable: /p/<id> for saved audits, / otherwise
  useEffect(() => {
    if (!analysis) return;
    const target = analysis.scan_id ? `/p/${analysis.scan_id}` : "/";
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [analysis]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nutritionFile) {
      setError("Please select at least the Nutrition Table image.");
      return;
    }

    setLoading(true);
    setError(null);
    track("scan_submit");

    const formData = new FormData();
    formData.append("nutrition_label", nutritionFile);
    if (ingredientsFile) formData.append("ingredients_label", ingredientsFile);
    frontFiles.forEach(({ file }) => formData.append("front_package", file));
    if (pendingBarcode) formData.append("barcode", pendingBarcode);
    if (productName.trim()) formData.append("product_name", productName.trim());
    if (price.trim()) formData.append("price", price.trim());
    if (expectedConsumption.trim()) formData.append("expected_consumption_g", expectedConsumption.trim());

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Analysis failed. Please check backend.");
      }

      setAnalysis(data.analysis);
      track("scan_success", { product_id: data.scan_id ?? null });
      setPendingBarcode(null);
      setBarcodeMsg(null);
      if (data.scan_id && data.edit_token) {
        saveEditToken(data.scan_id, data.edit_token);
        setEditTokens((prev) => ({ ...prev, [data.scan_id]: data.edit_token }));
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Hero: search and barcode first, with shoppers' questions floating behind */}
      <section className="relative mb-8 rounded-3xl border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-white px-4 pt-16 pb-16 sm:px-10 sm:pt-16 sm:pb-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          {AISLE_QUESTIONS.map(([text, pos, mobile], i) => (
            <span
              key={text}
              className={`aisle-q absolute ${pos} ${mobile ? "" : "hidden lg:inline-block"} whitespace-nowrap rounded-full border border-emerald-200/70 bg-white/70 px-3 py-1 text-[11px] sm:text-xs font-medium text-emerald-900/45`}
              style={{ animationDelay: `${i * -1.7}s` }}
            >
              {text}
            </span>
          ))}
        </div>

        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Label<span className="text-emerald-600">Padho</span>
          </h1>
          <p className="mt-3 text-lg sm:text-xl text-slate-700">
            Is your packaged food really healthy? Find out in a second.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="relative flex-1" ref={searchBoxRef}>
              <label htmlFor="product-search" className="sr-only">Search a product</label>
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-7 -translate-y-1/2 pointer-events-none" />
              <input
                id="product-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                placeholder="Search Maggi, Bourbon, Ragi Chips..."
                autoComplete="off"
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls="product-search-results"
                className="w-full h-14 pl-12 pr-11 rounded-2xl border border-slate-200 bg-white text-base shadow-md shadow-emerald-900/5 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-7 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {searchOpen && (
                <div
                  id="product-search-results"
                  className="absolute z-30 left-0 right-0 mt-2 text-left bg-white border border-slate-200 rounded-xl shadow-lg max-h-[26rem] overflow-y-auto"
                >
                  {(() => {
                    const catalogItems = q ? searchResults : suggestions;
                    const renderCatalogItem = (item: HistoryCard) => (
                      <li key={`scan-${item.id}`}>
                        <button
                          type="button"
                          onClick={() => openFromSearch(() => viewPastScan(item.id))}
                          className="w-full text-left px-4 py-2.5 hover:bg-emerald-50/60 transition flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {productTitle(item.brand, item.product_name, item.variant)}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{item.one_line_summary}</p>
                          </div>
                          {item.health_score != null && (
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 shrink-0">
                              {item.health_score}/10
                            </span>
                          )}
                        </button>
                      </li>
                    );
                    return (
                      <>
                        <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400">
                          {q ? "From the shared catalog" : "Recently scanned by the community"}
                        </p>
                        {q && searchLoading && searchResults.length === 0 ? (
                          <p className="px-4 py-2 text-xs text-slate-500">Searching...</p>
                        ) : catalogItems.length > 0 ? (
                          <ul>{catalogItems.map(renderCatalogItem)}</ul>
                        ) : (
                          <p className="px-4 py-2 text-xs text-slate-500">
                            {q && searchDone ? (
                              <>
                                No one has added &ldquo;{searchQuery.trim()}&rdquo; yet. Every product here was added once by someone and saved for everyone.{" "}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchOpen(false);
                                    openAdd(searchQuery.trim());
                                  }}
                                  className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Add it for everyone
                                </button>
                              </>
                            ) : !q ? (
                              "Nothing added yet. Be the first!"
                            ) : null}
                          </p>
                        )}

                        {matchingDemos.length > 0 && (
                          <>
                            <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400 border-t border-slate-100">
                              Try a sample
                            </p>
                            <ul className="pb-2">
                              {matchingDemos.map(({ label, analysis: demo }) => (
                                <li key={`demo-${label}`}>
                                  <button
                                    type="button"
                                    onClick={() => openFromSearch(() => loadDemoAudit(demo))}
                                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50/60 transition flex items-center justify-between gap-3 cursor-pointer"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 truncate">
                                        {productTitle(demo.extraction.brand, demo.extraction.product_name, demo.extraction.variant)}
                                      </p>
                                      <p className="text-xs text-slate-500 truncate">{demo.one_line_summary}</p>
                                    </div>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                      Sample
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBarcodeOpen((o) => !o)}
              className="h-14 shrink-0 rounded-2xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-md shadow-emerald-900/10 hover:bg-emerald-700 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ScanBarcode className="w-5 h-5" /> Scan barcode
            </button>
          </div>

          {barcodeOpen && <div className="mt-4 text-left"><BarcodeScanner onCode={lookupBarcode} onClose={() => setBarcodeOpen(false)} /></div>}
          {barcodeMsg && (
            <div className="mt-4 text-left text-sm text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
              <p>{barcodeMsg}</p>
              {pendingBarcode && (
                <button
                  type="button"
                  onClick={() => openAdd()}
                  className="mt-2 text-sm font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  Add this product
                </button>
              )}
            </div>
          )}

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-sm text-slate-700 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {productCount != null ? (
              <span>
                <span className="font-bold text-slate-900 tabular-nums">{productCount.toLocaleString("en-IN")}</span> products checked and counting
              </span>
            ) : (
              <span>Products checked by the community</span>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Every product was added once by someone, and saved for everyone. Results in under a second, no photos needed.
          </p>
        </div>
      </section>

      <p className="-mt-4 mb-8 text-center text-xs text-slate-500 max-w-xl mx-auto">
        Inspired by the consumer-awareness movements of changemakers like{" "}
        <span className="font-semibold text-slate-700">FoodPharmer (Revant Himatsingka)</span> and{" "}
        <span className="font-semibold text-slate-700">Glucose Gal (Pratima Dixit)</span>.
      </p>

      <>
          {/* Add a product: the fallback when search and barcode find nothing */}
          <section ref={addRef} id="add-product" className="scroll-mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 mb-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700 shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Can&apos;t find your product? Add it for everyone</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Snap the label once. AI reads it once, and it&apos;s saved forever, so the next person gets it in under a second.
                  </p>
                </div>
              </div>
              {!addOpen && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add a product
                </button>
              )}
            </div>
            {addOpen && (
            <form onSubmit={handleSubmit} className="space-y-6 mt-6 pt-6 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Nutrition Table (Required) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  {nutritionPreview ? (
                    <div>
                      <img
                        src={nutritionPreview}
                        alt="Nutrition table preview"
                        className="w-full h-32 object-contain rounded-lg bg-slate-50 border border-slate-200 mb-2"
                      />
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[140px]">
                          <CheckCircle2 className="w-3 h-3 inline -mt-0.5" /> {nutritionFile?.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleNutritionChange(null)}
                          className="text-[11px] text-red-600 font-semibold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <label className="block text-sm font-semibold text-slate-900 mb-1">
                        1. Nutrition Table <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-slate-500 mb-3">Photo of nutrition facts / chart</p>
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        required
                        onChange={(e) => handleNutritionChange(e.target.files?.[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer w-full"
                      />
                    </>
                  )}
                </div>

                {/* 2. Ingredients List (Optional) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  {ingredientsPreview ? (
                    <div>
                      <img
                        src={ingredientsPreview}
                        alt="Ingredients list preview"
                        className="w-full h-32 object-contain rounded-lg bg-slate-50 border border-slate-200 mb-2"
                      />
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[140px]">
                          <CheckCircle2 className="w-3 h-3 inline -mt-0.5" /> {ingredientsFile?.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIngredientsChange(null)}
                          className="text-[11px] text-red-600 font-semibold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <label className="block text-sm font-semibold text-slate-900 mb-1">
                        2. Ingredients Panel
                      </label>
                      <p className="text-xs text-slate-500 mb-3">Optional if on same photo</p>
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        onChange={(e) => handleIngredientsChange(e.target.files?.[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-white hover:file:bg-slate-700 cursor-pointer w-full"
                      />
                    </>
                  )}
                </div>

                {/* 3. Front of Pack + other claim panels (Optional, multiple) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  {frontFiles.length > 0 ? (
                    <div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {frontFiles.map(({ file, preview }, i) => (
                          <div key={preview} className="relative">
                            <img
                              src={preview}
                              alt={`Claim photo ${i + 1}: ${file.name}`}
                              className="w-full h-20 object-contain rounded-lg bg-slate-50 border border-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => removeFrontFile(i)}
                              className="absolute -top-1.5 -right-1.5 bg-white border border-slate-300 rounded-full p-0.5 text-slate-500 hover:text-red-600 cursor-pointer shadow-sm"
                              aria-label={`Remove ${file.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-amber-800">
                          <CheckCircle2 className="w-3 h-3 inline -mt-0.5" /> {frontFiles.length} of {MAX_CLAIM_PHOTOS} photos
                        </span>
                        {frontFiles.length < MAX_CLAIM_PHOTOS && (
                          <label className="text-[11px] text-emerald-700 font-semibold hover:underline cursor-pointer">
                            + Add another
                            <input
                              type="file"
                              accept="image/*,.heic,.heif"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                addFrontFiles(e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <label className="block text-sm font-semibold text-slate-900 mb-1">
                        3. Front &amp; Claims
                      </label>
                      <p className="text-xs text-slate-500 mb-3">
                        Front of pack + any panel with claims (up to {MAX_CLAIM_PHOTOS})
                      </p>
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        multiple
                        onChange={(e) => {
                          addFrontFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer w-full"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Additional Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product name <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Protein Nachos, Brown Bread"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    How much will you eat? <span className="font-normal text-slate-500">(grams, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={expectedConsumption}
                    onChange={(e) => setExpectedConsumption(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-amber-700 mt-1">Important — usual serving size can be deceiving.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Price you paid <span className="font-normal text-slate-500">(₹, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">MRP is read from the pack automatically.</p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-200">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">{loadingMsg}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>Check this label</span>
                  </>
                )}
              </button>
            </form>
            )}
          </section>

          {/* Analysis Results Display */}
          {shown && (
            <section ref={resultsRef} className="scroll-mt-4 space-y-8 animate-in fade-in duration-500">
              {/* Top Score Banner */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                      Label report
                    </span>
                    {shown.category_display_name && (
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/50 px-2.5 py-1 rounded-md">
                        {shown.category_display_name}
                        {shown.sub_category_display_name && ` · ${shown.sub_category_display_name}`}
                      </span>
                    )}
                    {shown.data_source === "open_food_facts" && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200" title="Built from the Open Food Facts barcode database (ODbL), not from label photos">
                        Data: Open Food Facts
                      </span>
                    )}
                  </div>
                  {renaming ? (
                    <div className="mt-2 space-y-2 max-w-xl">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(
                          [
                            ["brand", "Brand / company", "e.g. Gimi Gimi"],
                            ["product_name", "Product name *", "e.g. Sim Sim Chikki"],
                            ["variant", "Flavour / variant", "e.g. Jaggery"],
                          ] as const
                        ).map(([key, label, placeholder]) => (
                          <label key={key} className="text-[11px] font-semibold text-slate-600">
                            {label}
                            <input
                              type="text"
                              value={renameForm[key]}
                              onChange={(e) => setRenameForm({ ...renameForm, [key]: e.target.value })}
                              placeholder={placeholder}
                              className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </label>
                        ))}
                      </div>
                      {renameError && <p className="text-xs text-red-600">{renameError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveRename}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Save name
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(false)}
                          className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <h2 className="text-2xl font-bold text-slate-900">
                        {productTitle(shown.extraction.brand, shown.extraction.product_name, shown.extraction.variant)}
                      </h2>
                      {shown.scan_id && editTokens[shown.scan_id] && (
                        <button
                          type="button"
                          onClick={startRename}
                          className="text-xs font-semibold text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                          title="Only you can rename this, because you scanned it"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Name wrong? Fix it
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-slate-600 mt-1 max-w-xl text-sm">
                    {shown.one_line_summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={toggleHindi}
                      disabled={translating}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Languages className="w-3.5 h-3.5" />
                      {translating ? "अनुवाद हो रहा है..." : lang === "hi" ? "Show in English" : "हिंदी में पढ़ें"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!compareOpen) track("compare_open", { product_id: analysis?.scan_id ?? null });
                        setCompareOpen((o) => !o);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Scale className="w-3.5 h-3.5" /> Compare
                    </button>
                    <ShareMenu analysis={shown} />
                  </div>
                  {translateError && <p className="text-xs text-red-600 mt-1">{translateError}</p>}
                  {shown.scan_id && (
                    <div className="mt-3">
                      <ReportWrongData scanId={shown.scan_id} initialCount={shown.report_count ?? 0} />
                    </div>
                  )}
                </div>
                {shown.health_score && (
                  <div className="text-center bg-slate-50 border border-slate-200 px-6 py-4 rounded-xl flex-shrink-0 self-start md:self-center">
                    <span className="text-xs text-slate-500 font-semibold">Health score</span>
                    <div className="text-4xl font-extrabold text-slate-900 mt-0.5">
                      {shown.health_score} <span className="text-lg text-slate-400 font-normal">/ 10</span>
                    </div>
                    <ScoreBreakdown factors={shown.score_factors} basis={shown.score_basis} />
                  </div>
                )}
              </div>

              {/* Side-by-side compare */}
              {compareOpen && analysis && <ComparePanel base={analysis} onClose={() => setCompareOpen(false)} />}

              {/* No ingredient list: say so, and let the shopper complete the report */}
              {(shown.extraction.ingredients?.length ?? 0) === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Ingredient list missing</p>
                      <p className="text-sm text-amber-900/80 mt-0.5">
                        We only have this product&apos;s nutrition table, so the score is based on nutrition alone. Ingredient
                        flags, claim checks and the ingredient chart need the ingredient list. Add a photo of the pack and it
                        will be complete for everyone.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (shown.extraction.barcode) setPendingBarcode(shown.extraction.barcode);
                      openAdd(productTitle(shown.extraction.brand, shown.extraction.product_name, shown.extraction.variant));
                    }}
                    className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" /> Add label photos
                  </button>
                </div>
              )}

              {/* Personal health profile */}
              <ProfileCard analysis={shown} profile={profile} onChange={changeProfile} />

              {/* Shelf leaderboard: healthier options on the same shelf, from the shared catalog */}
              {alternatives && alternatives.total > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Better choices in {alternatives.scope_label}
                    </h3>
                    {alternatives.rank && alternatives.total > 1 && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
                        Ranked {alternatives.rank} of {alternatives.total} on this shelf
                      </span>
                    )}
                  </div>
                  {alternatives.better.length > 0 ? (
                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {alternatives.better.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => viewPastScan(item.id)}
                            className="w-full text-left px-4 py-3 hover:bg-emerald-50/60 transition flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {productTitle(item.brand, item.product_name, item.variant)}
                              </p>
                              <p className="text-xs text-slate-500 truncate">{item.one_line_summary}</p>
                            </div>
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                              {item.health_score}/10
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">
                      {alternatives.total > 1
                        ? "This is the best-scoring product on this shelf so far."
                        : "This is the first product scanned on this shelf. Scan similar products to compare."}
                    </p>
                  )}
                  {alternatives.scope === "category" && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      No other products on the exact same shelf yet, so this compares across the wider category.
                    </p>
                  )}
                </div>
              )}

              {/* 100% Ingredient Distribution & Hero Trap Pie Chart */}
              {shown.ingredient_breakdown && (
                <IngredientDonutChart breakdown={shown.ingredient_breakdown} />
              )}

              {/* Claim Verification Layer (Glucose Gal / FoodPharmer style) */}
              {shown.claim_verifications && shown.claim_verifications.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Front-of-Pack Claims Check (FSSAI)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shown.claim_verifications.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border ${
                          item.status === "verified"
                            ? "bg-emerald-50/50 border-emerald-200"
                            : item.status === "misleading"
                            ? "bg-amber-50/50 border-amber-200"
                            : "bg-red-50/50 border-red-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-900 text-sm">{item.claim}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              item.status === "verified"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "misleading"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mb-2 leading-relaxed">{item.explanation}</p>
                        {item.fssai_rule && (
                          <span className="text-[10px] text-slate-500 italic block">
                            Ref: {item.fssai_rule}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calorie Math Verification (Atwater Check) */}
              {shown.math_verification && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Calculator className="w-5 h-5 text-indigo-500" />
                    Calorie Math Verification (Atwater Balance Check)
                  </h3>
                  <div
                    className={`p-4 rounded-xl border ${
                      shown.math_verification.is_discrepant
                        ? "bg-red-50/50 border-red-200"
                        : "bg-emerald-50/50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {shown.math_verification.is_discrepant ? (
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-slate-900">
                        {shown.math_verification.is_discrepant
                          ? "Discrepancy in Printed Nutrition Table!"
                          : "Nutritional Calorie Sum Verified"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed mt-1">
                      {shown.math_verification.details}
                    </p>
                  </div>
                </div>
              )}

              {shown.serving_reality?.realistic_consumption && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Portion Reality Check
                  </h3>
                  <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-200">
                    <p className="text-sm text-slate-700 leading-relaxed">{shown.serving_reality.realistic_consumption}</p>
                  </div>
                </div>
              )}

              {/* Flagged Ingredients */}
              {shown.ingredient_flags && shown.ingredient_flags.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Flagged Additives & Health Concerns
                  </h3>
                  <div className="space-y-3">
                    {shown.ingredient_flags.map((flag, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {flag.ingredient_name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                flag.severity === "high"
                                  ? "bg-red-100 text-red-800"
                                  : flag.severity === "medium"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {flag.severity} concern
                            </span>
                          </div>
                          {flag.title && (
                            <p className="text-xs font-semibold text-slate-800 mt-1">{flag.title}</p>
                          )}
                          <p className="text-xs text-slate-600 mt-1">{flag.explanation}</p>
                        </div>
                        {flag.regulatory_source && (
                          <span className="text-[10px] text-slate-400 sm:text-right flex-shrink-0">
                            {flag.regulatory_source}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Macro Value & Whole Food Alternatives */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Value Assessment */}
                {shown.price_analysis && (shown.price_analysis.price_per_g_protein || shown.price_analysis.value_verdict) && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                      Price-per-Gram Value Check
                    </h3>
                    <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-2">
                      {shown.price_analysis.mrp_inr && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">MRP on pack (read from photo):</span>
                          <span className="font-bold text-slate-900">₹{shown.price_analysis.mrp_inr}</span>
                        </div>
                      )}
                      {shown.price_analysis.price_paid_inr && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">You paid:</span>
                          <span className="font-bold text-slate-900">
                            ₹{shown.price_analysis.price_paid_inr}
                            {shown.price_analysis.discount_pct ? (
                              <span className="ml-1.5 text-xs font-semibold text-emerald-700">
                                ({shown.price_analysis.discount_pct}% below MRP)
                              </span>
                            ) : null}
                          </span>
                        </div>
                      )}
                      {shown.price_analysis.price_per_g_protein && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Cost per gram of protein:</span>
                          <span className="font-bold text-slate-900">
                            ₹{shown.price_analysis.price_per_g_protein.toFixed(2)} / g
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-slate-700 pt-1 leading-relaxed border-t border-emerald-200/60">
                        {shown.price_analysis.value_verdict}
                      </p>
                    </div>
                  </div>
                )}
                {!shown.price_analysis && shown.extraction.mrp_inr && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                      Price
                    </h3>
                    <p className="text-sm text-slate-700">
                      MRP on pack (read from photo): <span className="font-bold">₹{shown.extraction.mrp_inr}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the price you paid when checking a label to see cost per gram of protein.
                    </p>
                  </div>
                )}

                {/* Better swaps */}
                {shown.natural_alternatives && shown.natural_alternatives.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Leaf className="w-5 h-5 text-emerald-600" />
                      Better Swaps
                    </h3>
                    <div className="space-y-2">
                      {shown.natural_alternatives.slice(0, 3).map((alt, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-900">{alt.food_name}</span>
                            <span className="text-slate-500 ml-1.5">
                              ({alt.quantity} = {alt.nutrient_amount})
                            </span>
                          </div>
                          {alt.approx_cost_inr && (
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              ~₹{alt.approx_cost_inr}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Homemade Kitchen Swaps */}
              {shown.homemade_recipes && shown.homemade_recipes.length > 0 && (
                <HomemadeRecipesCard recipes={shown.homemade_recipes} />
              )}

              {/* Educational Notes (Progressive Learning) */}
              {shown.educational_notes && shown.educational_notes.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Nutrition Lessons from this Label
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {shown.educational_notes.map((note, idx) => (
                      <div key={idx} className="p-4 bg-blue-50/40 rounded-xl border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-700">
                          {note.triggered_by}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">{note.title}</h4>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{note.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
      </>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-center space-y-1.5">
        <p className="text-[11px] text-slate-400">
          General guidance from food labels, not medical advice. Some product data from{" "}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
            Open Food Facts
          </a>{" "}
          contributors (ODbL).
        </p>
      </footer>
    </main>
  );
}
