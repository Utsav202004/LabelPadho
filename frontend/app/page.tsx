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
  History,
  ScanLine,
  Trash2,
  ArrowRight,
  PieChart,
  ChefHat,
  Clock,
  Utensils
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

interface ProductAnalysis {
  extraction: {
    product_name?: string;
    brand?: string;
    product_category?: string;
    category_reasoning?: string;
    nutrition_per_serving?: NutritionInfo;
    ingredients: ExtractedIngredient[];
    claims: string[];
  };
  product_category?: string;
  category_display_name?: string;
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
  brand?: string;
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

// In Next.js, env vars prefixed with NEXT_PUBLIC_ are available in the browser.
// Locally: falls back to localhost:8000
// On Vercel: set NEXT_PUBLIC_API_URL to your Render backend URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
      explanation: "Packaged as 'Multigrain', but the #1 primary ingredient by weight is Refined Wheat Flour (Maida) at 54%. Grains other than wheat make up only 4% (oats).",
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
        fssai_disclosure: "Under FSSAI Regulations, carbonated beverages list ingredients in strict descending order of weight. Water forms the bulk (#1), followed by sugar (#2), and micro-additives (INS 338, 150d) at <1%.",
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
        fssai_disclosure: "Under FSSAI Regulations, Mango Pulp (12%) is declared under statutory QUID rules. Sugar (13.5%) is derived from the nutrition table. Water (#1 by weight) and micro-stabilizers make up the rest.",
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
        { claim: "100% Real Juicy Tomatoes", status: "misleading", explanation: "Contains real tomato paste, but at only 26%. The #1 ingredient by weight is water, and the second largest solid is added white sugar (25%).", fssai_rule: "FSSAI Misleading Ingredient Representation" },
        { claim: "Classic Sweet & Tangy", status: "verified", explanation: "Taste profile produced by combining 25% sugar with acetic acid (INS 260) and salt.", fssai_rule: "Standard flavour description" },
      ],
      price_analysis: undefined,
      ingredient_breakdown: {
        has_hero_trap: true,
        hero_insight: "1/4th of this bottle is pure white sugar (25.0%). In fact, 2 tablespoons have more sugar (8g) than a sweet biscuit, heavily disguised by high salt and vinegar acid.",
        hero_percentage: 26.0,
        filler_percentage: 25.0,
        coverage_percentage: 51.0,
        fssai_disclosure: "Under FSSAI Regulations, Tomato Paste (26%) is declared under statutory QUID rules. Sugar (25%) is derived from the nutrition panel. Water (#1 by weight) and thickeners form the remaining bulk.",
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
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block mb-0.5">
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
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
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
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Statutory Order of Ingredients (By Weight on Package):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {breakdown.descending_ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                  >
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded">
                      #{i + 1}
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan");
  
  // Upload inputs
  const [nutritionFile, setNutritionFile] = useState<File | null>(null);
  const [ingredientsFile, setIngredientsFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [expectedConsumption, setExpectedConsumption] = useState("");
  
  // Loading & states
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Preparing label photos...");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);

  useEffect(() => {
    if (!loading) {
      setLoadingMsg("Preparing label photos...");
      return;
    }
    const t1 = setTimeout(() => setLoadingMsg("Extracting nutrition table & ingredients with Gemini Vision..."), 6000);
    const t2 = setTimeout(() => setLoadingMsg("Auditing FSSAI front claims, palm oil & Atwater math..."), 15000);
    const t3 = setTimeout(() => setLoadingMsg("Synthesizing plain-language verdict (cloud container waking up)..."), 28000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  // History state
  const [historyList, setHistoryList] = useState<HistoryCard[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch history when tab switches
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab]);

  const loadDemoAudit = (demo: ProductAnalysis) => {
    setError(null);
    setAnalysis(demo);
    setActiveTab("scan");
    setTimeout(() => {
      window.scrollTo({ top: 480, behavior: "smooth" });
    }, 100);
  };

  const loadRandomDemoAudit = () => {
    const randomDemo = DEMO_AUDITS[Math.floor(Math.random() * DEMO_AUDITS.length)];
    loadDemoAudit(randomDemo.analysis);
  };

  const viewPastScan = async (scanId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/history/${scanId}`);
      if (!res.ok) throw new Error("Could not load past scan details");
      const pastData: ProductAnalysis = await res.json();
      setAnalysis(pastData);
      setActiveTab("scan");
      window.scrollTo({ top: 400, behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Failed to load past audit");
    } finally {
      setLoading(false);
    }
  };

  const deletePastScan = async (e: React.MouseEvent, scanId: number) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/history/${scanId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setHistoryList((prev) => prev.filter((item) => item.id !== scanId));
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nutritionFile) {
      setError("Please select at least the Nutrition Table image.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("nutrition_label", nutritionFile);
    if (ingredientsFile) formData.append("ingredients_label", ingredientsFile);
    if (frontFile) formData.append("front_package", frontFile);
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
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Label<span className="text-emerald-600">Padho</span>
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          Expose misleading packaged food claims, audit FSSAI compliance, and catch rigged calorie tables.
        </p>
        <p className="mt-2.5 text-xs text-slate-500 max-w-xl mx-auto">
          💡 Inspired by the consumer-awareness movements of changemakers like{" "}
          <span className="font-semibold text-slate-700">FoodPharmer (Revant Himatsingka)</span> and{" "}
          <span className="font-semibold text-slate-700">Glucose Gal (Pratima Dixit)</span>.
        </p>

        {/* Navigation Tabs */}
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${
              activeTab === "scan"
                ? "bg-slate-900 text-white shadow"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <ScanLine className="w-4 h-4" />
            Audit Scanner
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${
              activeTab === "history"
                ? "bg-slate-900 text-white shadow"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <History className="w-4 h-4" />
            Scan History
          </button>
        </div>

        {/* Instant Recruiter Demo */}
        <div className="mt-5">
          <button type="button" onClick={loadRandomDemoAudit} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-md border border-emerald-200/80 text-xs transition cursor-pointer">
            Instant demo audit
          </button>
          <p className="text-[11px] text-slate-500 mt-1.5">Randomly loads one of six familiar Indian shelf products.</p>
        </div>
      </header>

      {/* SCANNER VIEW */}
      {activeTab === "scan" && (
        <>
          {/* Upload Form */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Nutrition Table (Required) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <label className="block text-sm font-semibold text-slate-900 mb-1">
                    1. Nutrition Table <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-3">Photo of nutrition facts / chart</p>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    required
                    onChange={(e) => setNutritionFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer w-full"
                  />
                </div>

                {/* 2. Ingredients List (Optional) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <label className="block text-sm font-semibold text-slate-900 mb-1">
                    2. Ingredients Panel
                  </label>
                  <p className="text-xs text-slate-500 mb-3">Optional if on same photo</p>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    onChange={(e) => setIngredientsFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-white hover:file:bg-slate-700 cursor-pointer w-full"
                  />
                </div>

                {/* 3. Front of Pack (Optional) */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                  <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <label className="block text-sm font-semibold text-slate-900 mb-1">
                    3. Front of Pack
                  </label>
                  <p className="text-xs text-slate-500 mb-3">Verifies 'Multigrain' / 'High Protein'</p>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    onChange={(e) => setFrontFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer w-full"
                  />
                </div>
              </div>

              {/* Additional Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Product Name <span className="normal-case">(Optional)</span>
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    How Much Will You Eat? <span className="normal-case">(Grams - Optional)</span>
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Product Price <span className="normal-case">(₹ INR - Optional)</span>
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
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
                    <span>Audit Food Label</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Analysis Results Display */}
          {analysis && (
            <section className="space-y-8 animate-in fade-in duration-500">
              {/* Top Score Banner */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                      Audit Result
                    </span>
                    {analysis.category_display_name && (
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/50 px-2.5 py-1 rounded-md">
                        🏷️ {analysis.category_display_name}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mt-1">
                    {analysis.extraction.product_name || "Packaged Food Product"}
                  </h2>
                  <p className="text-slate-600 mt-1 max-w-xl text-sm">
                    {analysis.one_line_summary}
                  </p>
                </div>
                {analysis.health_score && (
                  <div className="text-center bg-slate-50 border border-slate-200 px-6 py-4 rounded-xl flex-shrink-0">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Health Score</span>
                    <div className="text-4xl font-extrabold text-slate-900 mt-0.5">
                      {analysis.health_score} <span className="text-lg text-slate-400 font-normal">/ 10</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 100% Ingredient Distribution & Hero Trap Pie Chart */}
              {analysis.ingredient_breakdown && (
                <IngredientDonutChart breakdown={analysis.ingredient_breakdown} />
              )}

              {/* Claim Verification Layer (Glucose Gal / FoodPharmer style) */}
              {analysis.claim_verifications && analysis.claim_verifications.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Front-of-Pack Claim Audit (FSSAI Check)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.claim_verifications.map((item, idx) => (
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
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${
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
              {analysis.math_verification && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Calculator className="w-5 h-5 text-indigo-500" />
                    Calorie Math Verification (Atwater Balance Check)
                  </h3>
                  <div
                    className={`p-4 rounded-xl border ${
                      analysis.math_verification.is_discrepant
                        ? "bg-red-50/50 border-red-200"
                        : "bg-emerald-50/50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {analysis.math_verification.is_discrepant ? (
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-slate-900">
                        {analysis.math_verification.is_discrepant
                          ? "Discrepancy in Printed Nutrition Table!"
                          : "Nutritional Calorie Sum Verified"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed mt-1">
                      {analysis.math_verification.details}
                    </p>
                  </div>
                </div>
              )}

              {analysis.serving_reality?.realistic_consumption && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Portion Reality Check
                  </h3>
                  <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-200">
                    <p className="text-sm text-slate-700 leading-relaxed">{analysis.serving_reality.realistic_consumption}</p>
                  </div>
                </div>
              )}

              {/* Flagged Ingredients */}
              {analysis.ingredient_flags && analysis.ingredient_flags.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Flagged Additives & Health Concerns
                  </h3>
                  <div className="space-y-3">
                    {analysis.ingredient_flags.map((flag, idx) => (
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
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
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
                {analysis.price_analysis && (analysis.price_analysis.price_per_g_protein || analysis.price_analysis.value_verdict) && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                      Price-per-Gram Value Check
                    </h3>
                    <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-2">
                      {analysis.price_analysis.price_per_g_protein && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Cost per gram of protein:</span>
                          <span className="font-bold text-slate-900">
                            ₹{analysis.price_analysis.price_per_g_protein.toFixed(2)} / g
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-slate-700 pt-1 leading-relaxed border-t border-emerald-200/60">
                        {analysis.price_analysis.value_verdict}
                      </p>
                    </div>
                  </div>
                )}

                {/* Better swaps */}
                {analysis.natural_alternatives && analysis.natural_alternatives.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Leaf className="w-5 h-5 text-emerald-600" />
                      Better Swaps
                    </h3>
                    <div className="space-y-2">
                      {analysis.natural_alternatives.slice(0, 3).map((alt, idx) => (
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
              {analysis.homemade_recipes && analysis.homemade_recipes.length > 0 && (
                <HomemadeRecipesCard recipes={analysis.homemade_recipes} />
              )}

              {/* Educational Notes (Progressive Learning) */}
              {analysis.educational_notes && analysis.educational_notes.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Nutrition Lessons from this Label
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {analysis.educational_notes.map((note, idx) => (
                      <div key={idx} className="p-4 bg-blue-50/40 rounded-xl border border-blue-100">
                        <span className="text-[10px] font-bold uppercase text-blue-700 tracking-wider">
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
      )}

      {/* HISTORY VIEW */}
      {activeTab === "history" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">Past Audits & Scans</h2>
            <button
              onClick={loadHistory}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading history...
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-slate-600 text-sm">No food labels audited yet.</p>
              <button
                onClick={() => setActiveTab("scan")}
                className="mt-3 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
              >
                Scan Your First Label
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => viewPastScan(item.id)}
                  className="bg-white border border-slate-200 hover:border-emerald-300 rounded-xl p-5 shadow-sm transition hover:shadow-md cursor-pointer relative group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{item.product_name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(item.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      {item.health_score && (
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800">
                          {item.health_score}/10
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                      {item.one_line_summary}
                    </p>

                    {/* Micro badges */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {item.product_category && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium border border-indigo-100">
                          {item.product_category.replace(/_/g, " ")}
                        </span>
                      )}
                      {item.price_inr && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                          ₹{item.price_inr}
                        </span>
                      )}
                      {item.protein_per_serving_g && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-medium">
                          {item.protein_per_serving_g}g Protein
                        </span>
                      )}
                      {item.debunked_claims_count > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium">
                          {item.debunked_claims_count} False Claim
                        </span>
                      )}
                      {item.flag_count > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                          {item.flag_count} Flagged Additive
                        </span>
                      )}
                      {item.has_calorie_discrepancy && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded font-medium">
                          Calorie Discrepancy
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 text-xs">
                    <span className="text-emerald-600 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      View Full Audit <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                    <button
                      onClick={(e) => deletePastScan(e, item.id)}
                      className="text-slate-400 hover:text-red-500 p-1 rounded transition"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-12 border-t border-slate-200 pt-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Coming next</p>
        <p className="mt-2 text-sm text-slate-600">
          Shelf product leaderboards and instant barcode lookups to make healthier grocery decisions easier.
        </p>
      </section>
    </main>
  );
}
