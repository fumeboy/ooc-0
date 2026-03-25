
// 技术评估维度权重
const WEIGHTS = {
  maturity: 0.25,
  impact: 0.30,
  feasibility: 0.20,
  urgency: 0.25
};

// 雷达环阈值
const RINGS = [
  { name: "Adopt",  min: 80, label: "采纳 — 强烈推荐立即采用" },
  { name: "Trial",  min: 60, label: "试验 — 值得在真实场景中试用" },
  { name: "Assess", min: 40, label: "评估 — 值得探索和研究" },
  { name: "Hold",   min: 0,  label: "暂缓 — 暂不推荐投入" }
];

const QUADRANTS = {
  "core-arch":   "核心架构",
  "dev-exp":     "开发体验",
  "ecosystem":   "生态扩展",
  "philosophy":  "哲学演进"
};

function assessTech(name, quadrant, scores) {
  const weighted = Object.keys(WEIGHTS).reduce(function(sum, dim) {
    return sum + (scores[dim] || 0) * WEIGHTS[dim];
  }, 0);
  var ring = RINGS.find(function(r) { return weighted >= r.min; });
  return {
    name: name,
    quadrant: QUADRANTS[quadrant] || quadrant,
    scores: scores,
    weighted: Math.round(weighted * 10) / 10,
    ring: ring.name,
    ringLabel: ring.label
  };
}

function generateRadar(assessments) {
  var sorted = assessments.slice().sort(function(a, b) { return b.weighted - a.weighted; });
  
  var md = "# OOC 技术雷达\n\n";
  md += "> 生成时间: " + new Date().toISOString().split("T")[0] + "\n\n";
  
  for (var i = 0; i < RINGS.length; i++) {
    var ring = RINGS[i];
    var items = sorted.filter(function(a) { return a.ring === ring.name; });
    if (items.length === 0) continue;
    md += "## " + ring.name + " — " + ring.label + "\n\n";
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      md += "### " + item.name + " (" + item.quadrant + ")\n";
      md += "- 综合得分: **" + item.weighted + "**\n";
      md += "- 成熟度: " + item.scores.maturity + " | 影响力: " + item.scores.impact;
      md += " | 可行性: " + item.scores.feasibility + " | 紧迫性: " + item.scores.urgency + "\n\n";
    }
  }
  
  md += "## 总览\n\n";
  md += "| 技术 | 象限 | 得分 | 环 |\n";
  md += "|------|------|------|-----|\n";
  for (var k = 0; k < sorted.length; k++) {
    var item = sorted[k];
    md += "| " + item.name + " | " + item.quadrant + " | " + item.weighted + " | " + item.ring + " |\n";
  }
  
  return md;
}

module.exports = { assessTech: assessTech, generateRadar: generateRadar };
