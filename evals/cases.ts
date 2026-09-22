import type { DecisionRequest } from "../packages/contracts/src/index.js";

export type ExpectedAnswer =
  | { type: "choice"; value: string }
  | { type: "score"; value: number }
  | { type: "noul"; value: boolean };

export interface BenchmarkCase {
  id: string;
  title: string;
  request: Omit<DecisionRequest, "model">;
  expected: Record<string, ExpectedAnswer>;
}

export const benchmarkCases: BenchmarkCase[] = [
  {
    id: "game-01-boss-defense",
    title: "Boss 致命攻击：从合法动作中选最优防御",
    request: {
      state: {
        player_hp: 18,
        incoming_damage: 40,
        shield: { equipped: true, durability: 0, status: "broken" },
        dodge: { available: true, stamina_cost: 15, current_stamina: 20 },
        heal: { available: true, amount: 30, completes_after_attack: true },
      },
      questions: {
        action: {
          type: "choice",
          instructions:
            "Choose the only action that prevents the incoming lethal hit. Broken equipment cannot be used, and actions completing after the hit cannot prevent it.",
          criteria: {
            shield: "Block with the equipped shield",
            dodge: "Spend stamina to dodge before the hit lands",
            heal: "Cast the heal",
            attack: "Attack the boss",
          },
        },
      },
    },
    expected: { action: { type: "choice", value: "dodge" } },
  },
  {
    id: "game-02-aggro",
    title: "仇恨系统：嘲讽覆盖 threat，潜行目标无效",
    request: {
      state: {
        rule: "An active taunt overrides threat. Stealthed units cannot be targeted unless revealed.",
        units: [
          { id: "tank", threat: 35, active_taunt: true, stealthed: false },
          { id: "mage", threat: 90, active_taunt: false, stealthed: false },
          { id: "rogue", threat: 140, active_taunt: false, stealthed: true, revealed: false },
        ],
      },
      questions: {
        target: {
          type: "choice",
          instructions: "Which unit must the boss target under the stated aggro rule?",
          criteria: { tank: null, mage: null, rogue: null },
        },
      },
    },
    expected: { target: { type: "choice", value: "tank" } },
  },
  {
    id: "game-03-element-counter",
    title: "事件序列：忽略取消事件后计算元素克制",
    request: {
      state: {
        rule: "After all listed events, process them by ascending time and then ascending event_id. An event with cancelled=true has no effect. The last non-cancelled stance is current. Counter cycle: water beats fire, lightning beats water, earth beats lightning, fire beats earth.",
        events: [
          { event_id: 1, time: 40, stance: "fire", cancelled: false },
          { event_id: 2, time: 55, stance: "earth", cancelled: false },
          { event_id: 4, time: 70, stance: "water", cancelled: true },
          { event_id: 3, time: 65, stance: "lightning", cancelled: false },
        ],
      },
      questions: {
        counter: {
          type: "choice",
          instructions: "Which element counters the enemy's current valid stance?",
          criteria: { fire: null, water: null, lightning: null, earth: null },
        },
      },
    },
    expected: { counter: { type: "choice", value: "earth" } },
  },
  {
    id: "game-04-sealed-gate",
    title: "约束求解：四条正门路径均不可用",
    request: {
      state: {
        objective: "Pass the sealed gate without violating rules.",
        key: { owned: true, condition: "broken" },
        lockpick: { owned: true, durability: 2, required_durability: 3 },
        dispel: { learned: false, mana: 100, required_mana: 20 },
        bomb: { owned: true, forbidden_in_quest: true },
        alternate_route: { discovered: true, legal: true, currently_passable: true },
      },
      questions: {
        route: {
          type: "choice",
          instructions: "Choose a legal route that can actually pass the gate now.",
          criteria: {
            key: "Use the key",
            lockpick: "Pick the lock",
            dispel: "Cast dispel",
            bomb: "Destroy the gate",
            alternate_route: "Use the discovered alternate route",
          },
        },
      },
    },
    expected: { route: { type: "choice", value: "alternate_route" } },
  },
  {
    id: "game-05-threat-score",
    title: "威胁评分：多条件加权求和",
    request: {
      state: {
        scoring_rule: "Start at 0. Add 2 if enraged. Add 1 if healer is down. Add 1 if escape is unavailable. Add 1 if party average HP is below 30.",
        enraged: true,
        healer_down: false,
        escape_available: false,
        party_average_hp: 24,
      },
      questions: {
        threat: {
          type: "score",
          instructions: "Compute the exact threat score using only the supplied scoring rule.",
          criteria: ["0 points", "1 point", "2 points", "3 points", "4 points", "5 points"],
        },
      },
    },
    expected: { threat: { type: "score", value: 4 } },
  },
  {
    id: "game-06-matchmaking-score",
    title: "匹配公平性：边界条件与无关特征",
    request: {
      state: {
        scoring_rule: "Start at 0. Add 2 if rank gap is at least 3. Add 1 if ping is above 100 ms. Add 1 if premade size gap is at least 3. Add 2 only for a verified smurf.",
        rank_gap: 3,
        ping_ms: 92,
        premade_size_gap: 3,
        verified_smurf: false,
        recent_win_streak: 12,
      },
      questions: {
        unfairness: {
          type: "score",
          instructions: "Compute the exact unfairness score. Ignore fields not named in the scoring rule.",
          criteria: ["0 points", "1 point", "2 points", "3 points", "4 points", "5 points", "6 points"],
        },
      },
    },
    expected: { unfairness: { type: "score", value: 3 } },
  },
  {
    id: "game-07-quest-veto",
    title: "任务解锁：满足主条件但被全局否决",
    request: {
      state: {
        rule: "Unlock when (sigils >= 3 AND boss_defeated) OR admin_override. However account_suspended is a global veto and always prevents unlock.",
        sigils: 4,
        boss_defeated: true,
        admin_override: false,
        account_suspended: true,
      },
      questions: {
        unlocked: {
          type: "noul",
          instructions: "Is the quest unlocked under the complete rule, including the global veto?",
          criteria: { true: "Unlocked", false: "Not unlocked" },
        },
      },
    },
    expected: { unlocked: { type: "noul", value: false } },
  },
  {
    id: "game-08-anticheat",
    title: "反作弊：组合布尔条件与高 K/D 干扰项",
    request: {
      state: {
        rule: "Flag when (speed_events >= 3 AND server_desync is false) OR signed_hook is true. K/D is not part of this rule.",
        speed_events: 4,
        server_desync: true,
        signed_hook: false,
        kill_death_ratio: 19.7,
      },
      questions: {
        flag: {
          type: "noul",
          instructions: "Should this player be flagged under exactly the supplied rule?",
          criteria: { true: "Flag", false: "Do not flag" },
        },
      },
    },
    expected: { flag: { type: "noul", value: false } },
  },
  {
    id: "business-09-support-routing",
    title: "业务路由：结构化事实覆盖消息措辞",
    request: {
      state: {
        precedence_rule: "verified_facts are authoritative. When message_text conflicts with them, ignore the conflicting prose claim.",
        message_text: "I do not recognize yesterday's login, and I was charged twice for the season pass.",
        verified_facts: {
          login_recognized_by_user: true,
          duplicate_charge_verified: true,
        },
      },
      questions: {
        team: {
          type: "choice",
          instructions: "Route to the team responsible for the remaining verified issue.",
          criteria: {
            security: "Unknown or compromised login",
            billing: "Duplicate or incorrect charge",
            gameplay: "Game mechanics or progression",
            other: "No listed verified issue",
          },
        },
      },
    },
    expected: { team: { type: "choice", value: "billing" } },
  },
  {
    id: "game-10-compound-turn",
    title: "复合战斗回合：动作、危险分与存活三问一致",
    request: {
      state: {
        timing: "Each question independently starts from this same initial state. For one settlement tick: choose one legal action, resolve its heal or reduction first, then incoming damage, then poison. Evaluate HP immediately after poison; do not simulate another tick.",
        player_hp: 32,
        incoming_damage: 30,
        poison_damage: 5,
        actions: {
          shield: { legal: true, damage_reduction: 20 },
          heal: { legal: true, healing: 25 },
          attack: { legal: true, interrupts_enemy: false },
          dodge: { legal: false },
        },
        computed_end_hp: { shield: 17, heal: 22, attack: -3, dodge: "illegal" },
        danger_rubric: { "0": ">75", "1": "51-75", "2": "25-50", "3": "1-24", "4": "<=0" },
      },
      questions: {
        action: {
          type: "choice",
          instructions: "Choose the legal action with the highest end HP.",
          criteria: { shield: null, heal: null, attack: null, dodge: null },
        },
        danger: {
          type: "score",
          instructions: "Using the best legal action's end HP, select the exact danger-rubric level.",
          criteria: [">75 HP", "51-75 HP", "25-50 HP", "1-24 HP", "0 HP or below"],
        },
        survives: {
          type: "noul",
          instructions: "After the best legal action, is the player alive at the end of this turn?",
          criteria: { true: "End HP is above 0", false: "End HP is 0 or below" },
        },
      },
    },
    expected: {
      action: { type: "choice", value: "heal" },
      danger: { type: "score", value: 3 },
      survives: { type: "noul", value: true },
    },
  },
];
