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
  Sparkles,
  History,
  ScanLine,
  Trash2,
  ArrowRight
} from "lucide-react";

interface NutritionInfo {
  serving_size_g?: number;
  servings_per_package?: number;
  energy_kcal?: number;
  protein_g?: number;
  carbohydrates_g?: number;
  sugar_g?: number;
  total_fat_g?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;
  sodium_mg?: number;
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
  food_name: string;
  quantity: string;
  nutrient_amount: string;
  approx_cost_inr?: number;
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

interface ServingReality {
  servings_in_package?: number;
  nutrition_full_package?: NutritionInfo;
  realistic_consumption: string;
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
  serving_reality?: ServingReality;
  natural_alternatives: NaturalAlternative[];
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
  educational_notes: [],
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan");
  
  // Upload inputs
  const [nutritionFile, setNutritionFile] = useState<File | null>(null);
  const [ingredientsFile, setIngredientsFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  
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

  const loadDemoAudit = () => {
    setError(null);
    setAnalysis(DEMO_AUDIT);
    setActiveTab("scan");
    setTimeout(() => {
      window.scrollTo({ top: 480, behavior: "smooth" });
    }, 100);
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
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium mb-3">
          <Sparkles className="w-4 h-4" /> Multimodal Food Label Auditor
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Label<span className="text-emerald-600">Padho</span>
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          Expose misleading packaged food claims, audit FSSAI compliance, and catch rigged calorie tables.
        </p>
        <p className="mt-2.5 text-xs text-slate-500 max-w-xl mx-auto">
          💡 Inspired by the consumer-awareness movements of changemakers like{" "}
          <span className="font-semibold text-slate-700">FoodPharmer (Revant Himatsingka)</span> and{" "}
          <span className="font-semibold text-slate-700">Glucose Goddess (Jessie Inchauspé)</span>.
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

        {/* 1-Click Recruiter Demo Button */}
        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-500">
          <span>Reviewing as an interviewer?</span>
          <button
            type="button"
            onClick={loadDemoAudit}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-full border border-emerald-200/80 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Click for Instant 1-Second Demo Audit
          </button>
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
                <div className="border-2 border-dashed border-emerald-300 rounded-xl p-4 text-center bg-emerald-50/30 hover:bg-emerald-50 transition">
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
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 transition">
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
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 transition">
                  <Upload className="w-8 h-8 text-amber-500 mx-auto mb-2" />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Product Name (Optional fallback)
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
                    Product Price (₹ INR - Optional)
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
                {analysis.price_analysis && (
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

                {/* Whole Food Indian Alternatives */}
                {analysis.natural_alternatives && analysis.natural_alternatives.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Leaf className="w-5 h-5 text-emerald-600" />
                      Natural Indian Whole-Food Alternatives
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
    </main>
  );
}
