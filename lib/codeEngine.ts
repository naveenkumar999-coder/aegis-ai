/**
 * MONDAY Universal Multilingual Code Synthesis Engine
 * Generates idiomatic, production-grade source code for any programming language,
 * algorithm, mathematical operation (+, -, *, /, %), data structure, or software task.
 */

export interface CodeResult {
  code: string;
  fileName: string;
  langName: string;
  summary: string;
}

interface LanguageMeta {
  name: string;
  ext: string;
}

const LANGUAGE_MAP: Record<string, LanguageMeta> = {
  python: { name: "Python", ext: ".py" },
  c: { name: "C", ext: ".c" },
  cpp: { name: "C++", ext: ".cpp" },
  csharp: { name: "C#", ext: ".cs" },
  java: { name: "Java", ext: ".java" },
  javascript: { name: "JavaScript", ext: ".js" },
  typescript: { name: "TypeScript", ext: ".ts" },
  html: { name: "HTML5", ext: ".html" },
  sql: { name: "SQL", ext: ".sql" },
  rust: { name: "Rust", ext: ".rs" },
  go: { name: "Go", ext: ".go" },
  php: { name: "PHP", ext: ".php" },
  kotlin: { name: "Kotlin", ext: ".kt" },
  swift: { name: "Swift", ext: ".swift" },
  ruby: { name: "Ruby", ext: ".rb" },
  bash: { name: "Bash", ext: ".sh" },
  powershell: { name: "PowerShell", ext: ".ps1" },
};

export class CodeEngine {
  /**
   * Detect targeted programming language from natural query.
   */
  public static detectLanguage(query: string): string {
    const q = query.toLowerCase();

    if (/(?:^|[^\w])(c\+\+|cpp|c plus plus)(?:[^\w]|$)/i.test(q)) return "cpp";
    if (/(?:^|[^\w])(c#|csharp|c sharp|dotnet|\.net)(?:[^\w]|$)/i.test(q)) return "csharp";
    if (/\b(javascript|js|node|nodejs)\b/i.test(q)) return "javascript";
    if (/\b(typescript|ts)\b/i.test(q)) return "typescript";
    if (/\b(python|py|django|flask|pandas|numpy)\b/i.test(q)) return "python";
    if (/\b(java)\b/i.test(q) && !/javascript/i.test(q)) return "java";
    if (/\b(html|css|webpage|website|web page)\b/i.test(q)) return "html";
    if (/\b(sql|database|query|mysql|postgres|sqlite)\b/i.test(q)) return "sql";
    if (/\b(rust|cargo)\b/i.test(q)) return "rust";
    if (/\b(golang|go language|go code)\b|(?:^|\s)in go(?:\s|$)/i.test(q)) return "go";
    if (/\b(php)\b/i.test(q)) return "php";
    if (/\b(kotlin)\b/i.test(q)) return "kotlin";
    if (/\b(swift)\b/i.test(q)) return "swift";
    if (/\b(ruby)\b/i.test(q)) return "ruby";
    if (/\b(bash|shell)\b/i.test(q)) return "bash";
    if (/\b(powershell|ps1)\b/i.test(q)) return "powershell";
    if (/\b(c language|c program|c code)\b|(?:^|\s)in c(?:\s|$)/i.test(q)) return "c";

    return "python";
  }

  /**
   * Detect algorithm / software concept / mathematical operator (+, -, *, /, %) from natural query.
   */
  public static detectConcept(query: string): string {
    const q = query.toLowerCase();

    // 1. SUBTRACTION (a - b, minus, minis, subtract, difference, a minus p)
    if (
      /\b(a\s*[-–—]\s*[bp]|a\s*minus\s*[bp]|a-b|a-p|nsp)\b/i.test(q) ||
      /\b(subtraction|subtract\s+(?:two\s+)?numbers|difference\s+of\s+(?:two\s+)?numbers|\bsubtract\b|\bminus\b|\bminis\b)\b/i.test(q)
    ) {
      return "subtract_numbers";
    }

    // 2. MULTIPLICATION (a * b, into, times, multiply, product, a into p)
    if (
      /\b(a\s*[\*xX]\s*[bp]|a\s*(?:into|times|multiplied\s+by)\s*[bp]|a\*b|a\*p)\b/i.test(q) ||
      /\b(multiplication|multiply\s+(?:two\s+)?numbers|product\s+of\s+(?:two\s+)?numbers|\bmultiply\b|\binto\b|\btimes\b)\b/i.test(q)
    ) {
      return "multiply_numbers";
    }

    // 3. DIVISION (a / b, divided by, divide, quotient, a divided by p, a by b)
    if (
      /\b(a\s*[\/]\s*[bp]|a\s*(?:divided\s+by|by)\s*[bp]|a\/b|a\/p)\b/i.test(q) ||
      /\b(division|divide\s+(?:two\s+)?numbers|quotient\s+of\s+(?:two\s+)?numbers|\bdivide\b|\bdivided\b)\b/i.test(q)
    ) {
      return "divide_numbers";
    }

    // 4. MODULUS (a % b, modulo, remainder, mod)
    if (
      /\b(a\s*[%]\s*[bp]|a\s*(?:mod|modulo)\s*[bp]|a%b|a%p)\b/i.test(q) ||
      /\b(modulus|modulo|remainder)\b/i.test(q)
    ) {
      return "modulo_numbers";
    }

    // 5. ADDITION (a + b, plus, add, sum, a plus p)
    if (
      /\b(a\s*[\+]\s*[bp]|a\s*plus\s*[bp]|a\+b|a\+p)\b/i.test(q) ||
      /\b(addition|add\s+(?:two\s+)?numbers|sum\s+of\s+(?:two\s+)?numbers|\badd\b|\bplus\b|\bpluss\b)\b/i.test(q)
    ) {
      return "add_numbers";
    }

    // 6. ALL ARITHMETIC / CALCULATOR
    if (/\b(arithmetic|basic\s+math|math\s+operations|all\s+operations|calc|calculator)\b/i.test(q)) return "calculator";

    // 7. HELLO WORLD
    if (/\b(hello world|hello|hi world|welcome)\b/i.test(q)) return "hello_world";

    // 8. OTHER CORE ALGORITHMS & DATA STRUCTURES
    if (/\b(fibonacci|fib)\b/i.test(q)) return "fibonacci";
    if (/\b(factorial|fact)\b/i.test(q)) return "factorial";
    if (/\b(prime|prime number|isprime)\b/i.test(q)) return "prime";
    if (/\b(palindrome)\b/i.test(q)) return "palindrome";
    if (/\b(reverse string|reverse array|reverse)\b/i.test(q)) return "reverse";
    if (/\b(binary search)\b/i.test(q)) return "binary_search";
    if (/\b(linear search)\b/i.test(q)) return "linear_search";
    if (/\b(bubble sort|sort|sorting|quicksort|merge sort)\b/i.test(q)) return "bubble_sort";
    if (/\b(even or odd|even odd|odd even)\b/i.test(q)) return "even_odd";
    if (/\b(matrix|matrices)\b/i.test(q)) return "matrix";
    if (/\b(linked list|linkedlist)\b/i.test(q)) return "linked_list";
    if (/\b(stack)\b/i.test(q)) return "stack";
    if (/\b(queue)\b/i.test(q)) return "queue";
    if (/\b(file io|read file|write file)\b/i.test(q)) return "file_io";
    if (/\b(pattern|pyramid|triangle|stars)\b/i.test(q)) return "pattern";
    if (/\b(todo|todo app|todo list)\b/i.test(q)) return "todo";

    return "generic";
  }

  /**
   * Synthesize code from query using Gemini API (if available) or offline knowledge base.
   */
  public static async synthesizeCode(query: string, apiKey?: string): Promise<CodeResult> {
    const langKey = CodeEngine.detectLanguage(query);
    const conceptKey = CodeEngine.detectConcept(query);
    const langMeta = LANGUAGE_MAP[langKey] || LANGUAGE_MAP.python;

    // 1. If Gemini API key is available, generate custom code dynamically for infinite knowledge
    const activeKey = apiKey || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : undefined);
    if (activeKey) {
      try {
        const prompt = `You are MONDAY Code Engine. The user wants source code for: "${query}".
Output ONLY the clean, well-commented source code for ${langMeta.name}.
Do NOT use markdown code fence backticks. Output plain executable code directly.
Add helpful comments explaining how the code functions.
Ensure standard mathematical symbols (+, -, *, /, %) are used directly for arithmetic operations.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeKey}`;
        const resp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          let generated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (generated) {
            generated = generated.replace(/^\`\`\`[a-zA-Z0-9_-]*\n/, "").replace(/\`\`\`$/, "").trim();
            const fileName = CodeEngine.getFileName(langKey, conceptKey, query);
            return {
              code: generated,
              fileName,
              langName: langMeta.name,
              summary: `${langMeta.name} ${conceptKey.replace(/_/g, " ")} code`,
            };
          }
        }
      } catch (err) {
        console.warn("Gemini dynamic code generation failed, using internal knowledge base:", err);
      }
    }

    // 2. Built-in Comprehensive Algorithmic & Mathematical Knowledge Base
    return CodeEngine.getBuiltinCode(langKey, conceptKey, query);
  }

  public static getFileName(langKey: string, conceptKey: string, query: string): string {
    const langMeta = LANGUAGE_MAP[langKey] || LANGUAGE_MAP.python;
    const base = conceptKey !== "generic" ? conceptKey : "monday_script";
    return `${base}${langMeta.ext}`;
  }

  public static getBuiltinCode(langKey: string, conceptKey: string, query: string): CodeResult {
    const langMeta = LANGUAGE_MAP[langKey] || LANGUAGE_MAP.python;
    const ext = langMeta.ext;
    const name = langMeta.name;

    // --- 1. SUBTRACTION (a - b) ---
    if (conceptKey === "subtract_numbers") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `subtract_numbers${ext}`,
            summary: "Python Subtraction (a - b)",
            code: `# MONDAY Neural Code Engine: Subtraction of (a - b) in Python

def subtract_two_numbers(a: float, b: float) -> float:
    """Calculates and returns the difference of two numbers (a - b)."""
    return a - b

if __name__ == "__main__":
    a = 50
    b = 20
    result = subtract_two_numbers(a, b)
    print(f"MONDAY Computation Result: {a} - {b} = {result}")
`,
          };
        case "c":
          return {
            langName: name,
            fileName: `subtract_numbers${ext}`,
            summary: "C Subtraction (a - b)",
            code: `// MONDAY Neural Code Engine: Subtraction of (a - b) in C
#include <stdio.h>

int subtractTwoNumbers(int a, int b) {
    return a - b;
}

int main() {
    int a = 50, b = 20;
    int diff = subtractTwoNumbers(a, b);
    printf("MONDAY Computation Result: %d - %d = %d\n", a, b, diff);
    return 0;
}
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `subtract_numbers${ext}`,
            summary: "C++ Subtraction (a - b)",
            code: `// MONDAY Neural Code Engine: Subtraction of (a - b) in C++
#include <iostream>

double subtractTwoNumbers(double a, double b) {
    return a - b;
}

int main() {
    double a = 50, b = 20;
    double result = subtractTwoNumbers(a, b);
    std::cout << "MONDAY Computation Result: " << a << " - " << b << " = " << result << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `SubtractNumbers${ext}`,
            summary: "Java Subtraction (a - b)",
            code: `// MONDAY Neural Code Engine: Subtraction of (a - b) in Java

public class SubtractNumbers {
    public static double subtractTwoNumbers(double a, double b) {
        return a - b;
    }

    public static void main(String[] args) {
        double a = 50, b = 20;
        double result = subtractTwoNumbers(a, b);
        System.out.println("MONDAY Computation Result: " + a + " - " + b + " = " + result);
    }
}
`,
          };
        case "javascript":
          return {
            langName: name,
            fileName: `subtract_numbers${ext}`,
            summary: "JavaScript Subtraction (a - b)",
            code: `// MONDAY Neural Code Engine: Subtraction of (a - b) in JavaScript
function subtractTwoNumbers(a, b) {
    return a - b;
}

const a = 50;
const b = 20;
const diff = subtractTwoNumbers(a, b);
console.log(\`MONDAY Computation Result: \${a} - \${b} = \${diff}\`);
`,
          };
        default:
          return {
            langName: name,
            fileName: `subtract_numbers${ext}`,
            summary: `${name} Subtraction`,
            code: `# MONDAY Neural Code Engine: Subtraction in ${name}
def subtract(a, b):
    return a - b

print("Result:", subtract(50, 20))
`,
          };
      }
    }

    // --- 2. MULTIPLICATION (a * b) ---
    if (conceptKey === "multiply_numbers") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `multiply_numbers${ext}`,
            summary: "Python Multiplication (a * b)",
            code: `# MONDAY Neural Code Engine: Multiplication of (a * b) in Python

def multiply_two_numbers(a: float, b: float) -> float:
    """Calculates and returns the product of two numbers (a * b)."""
    return a * b

if __name__ == "__main__":
    a = 12
    b = 8
    result = multiply_two_numbers(a, b)
    print(f"MONDAY Computation Result: {a} * {b} = {result}")
`,
          };
        case "c":
          return {
            langName: name,
            fileName: `multiply_numbers${ext}`,
            summary: "C Multiplication (a * b)",
            code: `// MONDAY Neural Code Engine: Multiplication of (a * b) in C
#include <stdio.h>

int multiplyTwoNumbers(int a, int b) {
    return a * b;
}

int main() {
    int a = 12, b = 8;
    int product = multiplyTwoNumbers(a, b);
    printf("MONDAY Computation Result: %d * %d = %d\n", a, b, product);
    return 0;
}
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `multiply_numbers${ext}`,
            summary: "C++ Multiplication (a * b)",
            code: `// MONDAY Neural Code Engine: Multiplication of (a * b) in C++
#include <iostream>

double multiplyTwoNumbers(double a, double b) {
    return a * b;
}

int main() {
    double a = 12, b = 8;
    double result = multiplyTwoNumbers(a, b);
    std::cout << "MONDAY Computation Result: " << a << " * " << b << " = " << result << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `MultiplyNumbers${ext}`,
            summary: "Java Multiplication (a * b)",
            code: `// MONDAY Neural Code Engine: Multiplication of (a * b) in Java

public class MultiplyNumbers {
    public static double multiplyTwoNumbers(double a, double b) {
        return a * b;
    }

    public static void main(String[] args) {
        double a = 12, b = 8;
        double result = multiplyTwoNumbers(a, b);
        System.out.println("MONDAY Computation Result: " + a + " * " + b + " = " + result);
    }
}
`,
          };
        case "javascript":
          return {
            langName: name,
            fileName: `multiply_numbers${ext}`,
            summary: "JavaScript Multiplication (a * b)",
            code: `// MONDAY Neural Code Engine: Multiplication of (a * b) in JavaScript
function multiplyTwoNumbers(a, b) {
    return a * b;
}

const a = 12;
const b = 8;
const product = multiplyTwoNumbers(a, b);
console.log(\`MONDAY Computation Result: \${a} * \${b} = \${product}\`);
`,
          };
        default:
          return {
            langName: name,
            fileName: `multiply_numbers${ext}`,
            summary: `${name} Multiplication`,
            code: `# MONDAY Neural Code Engine: Multiplication in ${name}
def multiply(a, b):
    return a * b

print("Result:", multiply(12, 8))
`,
          };
      }
    }

    // --- 3. DIVISION (a / b) ---
    if (conceptKey === "divide_numbers") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `divide_numbers${ext}`,
            summary: "Python Division (a / b)",
            code: `# MONDAY Neural Code Engine: Division of (a / b) in Python

def divide_two_numbers(a: float, b: float) -> float:
    """Calculates and returns the quotient of two numbers (a / b)."""
    if b == 0:
        raise ZeroDivisionError("Cannot divide by zero.")
    return a / b

if __name__ == "__main__":
    a = 100
    b = 4
    result = divide_two_numbers(a, b)
    print(f"MONDAY Computation Result: {a} / {b} = {result}")
`,
          };
        case "c":
          return {
            langName: name,
            fileName: `divide_numbers${ext}`,
            summary: "C Division (a / b)",
            code: `// MONDAY Neural Code Engine: Division of (a / b) in C
#include <stdio.h>

double divideTwoNumbers(double a, double b) {
    if (b == 0) return 0;
    return a / b;
}

int main() {
    double a = 100, b = 4;
    double quotient = divideTwoNumbers(a, b);
    printf("MONDAY Computation Result: %.2f / %.2f = %.2f\n", a, b, quotient);
    return 0;
}
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `divide_numbers${ext}`,
            summary: "C++ Division (a / b)",
            code: `// MONDAY Neural Code Engine: Division of (a / b) in C++
#include <iostream>
#include <stdexcept>

double divideTwoNumbers(double a, double b) {
    if (b == 0) throw std::invalid_argument("Cannot divide by zero.");
    return a / b;
}

int main() {
    double a = 100, b = 4;
    double result = divideTwoNumbers(a, b);
    std::cout << "MONDAY Computation Result: " << a << " / " << b << " = " << result << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `DivideNumbers${ext}`,
            summary: "Java Division (a / b)",
            code: `// MONDAY Neural Code Engine: Division of (a / b) in Java

public class DivideNumbers {
    public static double divideTwoNumbers(double a, double b) {
        if (b == 0) throw new ArithmeticException("Cannot divide by zero.");
        return a / b;
    }

    public static void main(String[] args) {
        double a = 100, b = 4;
        double result = divideTwoNumbers(a, b);
        System.out.println("MONDAY Computation Result: " + a + " / " + b + " = " + result);
    }
}
`,
          };
        case "javascript":
          return {
            langName: name,
            fileName: `divide_numbers${ext}`,
            summary: "JavaScript Division (a / b)",
            code: `// MONDAY Neural Code Engine: Division of (a / b) in JavaScript
function divideTwoNumbers(a, b) {
    if (b === 0) throw new Error("Cannot divide by zero.");
    return a / b;
}

const a = 100;
const b = 4;
const result = divideTwoNumbers(a, b);
console.log(\`MONDAY Computation Result: \${a} / \${b} = \${result}\`);
`,
          };
        default:
          return {
            langName: name,
            fileName: `divide_numbers${ext}`,
            summary: `${name} Division`,
            code: `# MONDAY Neural Code Engine: Division in ${name}
def divide(a, b):
    if b == 0: return 0
    return a / b

print("Result:", divide(100, 4))
`,
          };
      }
    }

    // --- 4. MODULO (a % b) ---
    if (conceptKey === "modulo_numbers") {
      return {
        langName: name,
        fileName: `modulo_numbers${ext}`,
        summary: `${name} Modulo (a % b)`,
        code: `# MONDAY Neural Code Engine: Modulo (a % b) in ${name}

def modulo_two_numbers(a: int, b: int) -> int:
    """Calculates and returns the remainder of two numbers (a % b)."""
    return a % b

if __name__ == "__main__":
    a = 29
    b = 5
    result = modulo_two_numbers(a, b)
    print(f"MONDAY Computation Result: {a} % {b} = {result}")
`,
      };
    }

    // --- 5. ADDITION (a + b) ---
    if (conceptKey === "add_numbers") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `add_numbers${ext}`,
            summary: "Python Addition (a + b)",
            code: `# MONDAY Neural Code Engine: Addition of (a + b) in Python

def add_two_numbers(a: float, b: float) -> float:
    """Calculates and returns the sum of two numbers (a + b)."""
    return a + b

if __name__ == "__main__":
    a = 15
    b = 25
    result = add_two_numbers(a, b)
    print(f"MONDAY Computation Result: {a} + {b} = {result}")
`,
          };
        case "c":
          return {
            langName: name,
            fileName: `add_numbers${ext}`,
            summary: "C Addition (a + b)",
            code: `// MONDAY Neural Code Engine: Addition of (a + b) in C
#include <stdio.h>

int addTwoNumbers(int a, int b) {
    return a + b;
}

int main() {
    int a = 15, b = 25;
    int sum = addTwoNumbers(a, b);
    printf("MONDAY Computation Result: %d + %d = %d\n", a, b, sum);
    return 0;
}
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `add_numbers${ext}`,
            summary: "C++ Addition (a + b)",
            code: `// MONDAY Neural Code Engine: Addition of (a + b) in C++
#include <iostream>

int addTwoNumbers(int a, int b) {
    return a + b;
}

int main() {
    int a = 15, b = 25;
    int sum = addTwoNumbers(a, b);
    std::cout << "MONDAY Computation Result: " << a << " + " << b << " = " << sum << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `AddNumbers${ext}`,
            summary: "Java Addition (a + b)",
            code: `// MONDAY Neural Code Engine: Addition of (a + b) in Java

public class AddNumbers {
    public static int addTwoNumbers(int a, int b) {
        return a + b;
    }

    public static void main(String[] args) {
        int a = 15;
        int b = 25;
        int sum = addTwoNumbers(a, b);
        System.out.println("MONDAY Computation Result: " + a + " + " + b + " = " + sum);
    }
}
`,
          };
        case "javascript":
          return {
            langName: name,
            fileName: `add_numbers${ext}`,
            summary: "JavaScript Addition (a + b)",
            code: `// MONDAY Neural Code Engine: Addition of (a + b) in JavaScript
function addTwoNumbers(a, b) {
    return a + b;
}

const a = 15;
const b = 25;
const sum = addTwoNumbers(a, b);
console.log(\`MONDAY Computation Result: \${a} + \${b} = \${sum}\`);
`,
          };
        default:
          return {
            langName: name,
            fileName: `add_numbers${ext}`,
            summary: `${name} Addition`,
            code: `# MONDAY Neural Code Engine: Addition in ${name}
def add(a, b):
    return a + b

print("Result:", add(15, 25))
`,
          };
      }
    }

    // --- 6. HELLO WORLD ---
    if (conceptKey === "hello_world") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "Python Hello World",
            code: `# MONDAY Neural Code Engine: Hello World in Python

def main():
    print("Hello, World! Generated by MONDAY for Boss Nani.")

if __name__ == "__main__":
    main()
`,
          };
        case "c":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "C Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in C
#include <stdio.h>

int main() {
    printf("Hello, World! Generated by MONDAY for Boss Nani.\n");
    return 0;
}
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "C++ Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in C++
#include <iostream>

int main() {
    std::cout << "Hello, World! Generated by MONDAY for Boss Nani." << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `HelloWorld${ext}`,
            summary: "Java Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in Java

public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World! Generated by MONDAY for Boss Nani.");
    }
}
`,
          };
        case "csharp":
          return {
            langName: name,
            fileName: `Program${ext}`,
            summary: "C# Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in C#
using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World! Generated by MONDAY for Boss Nani.");
    }
}
`,
          };
        case "javascript":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "JavaScript Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in JavaScript
console.log("Hello, World! Generated by MONDAY for Boss Nani.");
`,
          };
        case "html":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "HTML5 Hello World",
            code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MONDAY Hello World</title>
</head>
<body style="font-family: sans-serif; background: #0b0f19; color: #00f0ff; text-align: center; padding-top: 100px;">
  <h1>Hello, World!</h1>
  <p>Generated by MONDAY for Boss Nani.</p>
</body>
</html>
`,
          };
        case "sql":
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: "SQL Hello World",
            code: `-- MONDAY Neural Code Engine: Hello World in SQL
SELECT 'Hello, World! Generated by MONDAY for Boss Nani.' AS WelcomeMessage;
`,
          };
        case "rust":
          return {
            langName: name,
            fileName: `main${ext}`,
            summary: "Rust Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in Rust
fn main() {
    println!("Hello, World! Generated by MONDAY for Boss Nani.");
}
`,
          };
        case "go":
          return {
            langName: name,
            fileName: `main${ext}`,
            summary: "Go Hello World",
            code: `// MONDAY Neural Code Engine: Hello World in Go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World! Generated by MONDAY for Boss Nani.")
}
`,
          };
        default:
          return {
            langName: name,
            fileName: `hello_world${ext}`,
            summary: `${name} Hello World`,
            code: `# MONDAY Neural Code Engine: Hello World in ${name}
print("Hello, World! Generated by MONDAY for Boss Nani.")
`,
          };
      }
    }

    // --- 7. FIBONACCI ---
    if (conceptKey === "fibonacci") {
      switch (langKey) {
        case "python":
          return {
            langName: name,
            fileName: `fibonacci${ext}`,
            summary: "Python Fibonacci Series",
            code: `# MONDAY Neural Code Engine: Fibonacci Series in Python

def generate_fibonacci(n: int) -> list:
    series = []
    a, b = 0, 1
    for _ in range(n):
        series.append(a)
        a, b = b, a + b
    return series

if __name__ == "__main__":
    count = 10
    result = generate_fibonacci(count)
    print(f"Fibonacci series of first {count} numbers: {result}")
`,
          };
        case "cpp":
          return {
            langName: name,
            fileName: `fibonacci${ext}`,
            summary: "C++ Fibonacci Series",
            code: `// MONDAY Neural Code Engine: Fibonacci Series in C++
#include <iostream>
#include <vector>

std::vector<long long> getFibonacci(int n) {
    std::vector<long long> fib(n);
    if (n > 0) fib[0] = 0;
    if (n > 1) fib[1] = 1;
    for (int i = 2; i < n; ++i) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    return fib;
}

int main() {
    int n = 10;
    auto fib = getFibonacci(n);
    std::cout << "Fibonacci sequence: ";
    for (auto val : fib) std::cout << val << " ";
    std::cout << std::endl;
    return 0;
}
`,
          };
        case "java":
          return {
            langName: name,
            fileName: `Fibonacci${ext}`,
            summary: "Java Fibonacci Series",
            code: `// MONDAY Neural Code Engine: Fibonacci Series in Java

public class Fibonacci {
    public static void printFibonacci(int n) {
        long a = 0, b = 1;
        System.out.print("Fibonacci (" + n + " terms): ");
        for (int i = 0; i < n; i++) {
            System.out.print(a + " ");
            long next = a + b;
            a = b;
            b = next;
        }
        System.out.println();
    }

    public static void main(String[] args) {
        printFibonacci(10);
    }
}
`,
          };
        default:
          return {
            langName: name,
            fileName: `fibonacci${ext}`,
            summary: `${name} Fibonacci`,
            code: `# MONDAY Neural Code Engine: Fibonacci in ${name}
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        print(a, end=" ")
        a, b = b, a + b

fib(10)
`,
          };
      }
    }

    // --- 8. FACTORIAL ---
    if (conceptKey === "factorial") {
      return {
        langName: name,
        fileName: `factorial${ext}`,
        summary: `${name} Factorial Calculation`,
        code: `# MONDAY Neural Code Engine: Factorial Calculation in ${name}

def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("Factorial is undefined for negative numbers.")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

if __name__ == "__main__":
    num = 5
    print(f"Factorial of {num} is: {factorial(num)}")
`,
      };
    }

    // --- 9. PRIME NUMBERS ---
    if (conceptKey === "prime") {
      return {
        langName: name,
        fileName: `prime_checker${ext}`,
        summary: `${name} Prime Number Checker`,
        code: `# MONDAY Neural Code Engine: Prime Number Checker in ${name}
import math

def is_prime(n: int) -> bool:
    if n <= 1:
        return False
    if n <= 3:
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False
    i = 5
    while i * i <= n:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True

if __name__ == "__main__":
    test_num = 29
    print(f"Is {test_num} prime? {is_prime(test_num)}")
`,
      };
    }

    // --- 10. BINARY SEARCH ---
    if (conceptKey === "binary_search") {
      switch (langKey) {
        case "java":
          return {
            langName: name,
            fileName: `BinarySearch${ext}`,
            summary: "Java Binary Search",
            code: `// MONDAY Neural Code Engine: Binary Search in Java

public class BinarySearch {
    public static int binarySearch(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] numbers = { 2, 4, 7, 10, 15, 20, 25, 30 };
        int target = 15;
        int index = binarySearch(numbers, target);
        System.out.println("Element " + target + " found at index: " + index);
    }
}
`,
          };
        default:
          return {
            langName: name,
            fileName: `binary_search${ext}`,
            summary: `${name} Binary Search`,
            code: `# MONDAY Neural Code Engine: Binary Search in ${name}

def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

if __name__ == "__main__":
    data = [3, 9, 14, 19, 25, 33, 42, 57]
    val = 25
    pos = binary_search(data, val)
    print(f"Target {val} located at index: {pos}")
`,
          };
      }
    }

    // --- 11. BUBBLE SORT ---
    if (conceptKey === "bubble_sort") {
      return {
        langName: name,
        fileName: `bubble_sort${ext}`,
        summary: `${name} Bubble Sort Algorithm`,
        code: `# MONDAY Neural Code Engine: Bubble Sort Algorithm in ${name}

def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr

if __name__ == "__main__":
    unsorted = [64, 34, 25, 12, 22, 11, 90]
    print("Unsorted Array:", unsorted)
    sorted_arr = bubble_sort(unsorted)
    print("Sorted Array:  ", sorted_arr)
`,
      };
    }

    // --- 12. PALINDROME ---
    if (conceptKey === "palindrome") {
      return {
        langName: name,
        fileName: `palindrome_checker${ext}`,
        summary: `${name} Palindrome Checker`,
        code: `# MONDAY Neural Code Engine: Palindrome Checker in ${name}

def is_palindrome(s: str) -> bool:
    clean_s = ''.join(c.lower() for c in s if c.isalnum())
    return clean_s == clean_s[::-1]

if __name__ == "__main__":
    test_phrase = "A man, a plan, a canal: Panama"
    print(f"Phrase: '{test_phrase}'")
    print(f"Is Palindrome? {is_palindrome(test_phrase)}")
`,
      };
    }

    // --- 13. CALCULATOR & ARITHMETIC ---
    if (conceptKey === "calculator") {
      if (langKey === "html" || langKey === "javascript") {
        return {
          langName: "HTML5 & JavaScript",
          fileName: "calculator.html",
          summary: "Interactive Web Calculator",
          code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MONDAY Cybernetic Calculator</title>
  <style>
    body { background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Segoe UI', sans-serif; margin: 0; }
    .calc { background: #1e293b; padding: 24px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 280px; }
    .display { width: 100%; height: 50px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #38bdf8; font-size: 24px; text-align: right; padding: 8px 12px; box-sizing: border-box; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    button { padding: 14px; font-size: 18px; border: none; border-radius: 8px; background: #334155; color: #fff; cursor: pointer; transition: 0.2s; }
    button:hover { background: #475569; }
    button.op { background: #0284c7; }
    button.op:hover { background: #0369a1; }
    button.eq { background: #10b981; grid-column: span 2; }
    button.eq:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="calc">
    <input type="text" id="disp" class="display" readonly value="0">
    <div class="grid">
      <button onclick="clearDisp()">C</button>
      <button onclick="press('/')" class="op">/</button>
      <button onclick="press('*')" class="op">*</button>
      <button onclick="press('-')" class="op">-</button>
      <button onclick="press('7')">7</button>
      <button onclick="press('8')">8</button>
      <button onclick="press('9')">9</button>
      <button onclick="press('+')" class="op">+</button>
      <button onclick="press('4')">4</button>
      <button onclick="press('5')">5</button>
      <button onclick="press('6')">6</button>
      <button onclick="calculate()" class="eq">=</button>
      <button onclick="press('1')">1</button>
      <button onclick="press('2')">2</button>
      <button onclick="press('3')">3</button>
      <button onclick="press('0')">0</button>
    </div>
  </div>
  <script>
    let d = document.getElementById('disp');
    function press(v) { if (d.value === '0') d.value = v; else d.value += v; }
    function clearDisp() { d.value = '0'; }
    function calculate() { try { d.value = eval(d.value); } catch { d.value = 'Error'; } }
  </script>
</body>
</html>
`,
        };
      } else {
        return {
          langName: name,
          fileName: `calculator${ext}`,
          summary: `${name} Interactive Calculator (+, -, *, /)`,
          code: `# MONDAY Neural Code Engine: CLI Calculator (+, -, *, /) in ${name}

def calculate(a: float, b: float, op: str) -> float:
    """Performs basic arithmetic operations (+, -, *, /)."""
    if op == '+': return a + b
    elif op == '-': return a - b
    elif op == '*': return a * b
    elif op == '/':
        if b == 0: raise ZeroDivisionError("Cannot divide by zero.")
        return a / b
    else: raise ValueError(f"Unknown operator: {op}")

if __name__ == "__main__":
    print("MONDAY Calculator Engine (+, -, *, /)")
    print("10 + 5 =", calculate(10, 5, '+'))
    print("10 - 5 =", calculate(10, 5, '-'))
    print("10 * 5 =", calculate(10, 5, '*'))
    print("10 / 5 =", calculate(10, 5, '/'))
`,
        };
      }
    }

    // --- GENERIC DEFAULT ---
    const cleanQ = query.replace(/[\\/"']/g, "");
    return {
      langName: name,
      fileName: `monday_script${ext}`,
      summary: `${name} Script for ${cleanQ}`,
      code: `# MONDAY Multilingual Neural Code Engine
# Directive: ${cleanQ}
# Language: ${name}

def execute_task():
    print("MONDAY Directive Executed: ${cleanQ}")
    # Implement custom logic below:
    return True

if __name__ == "__main__":
    execute_task()
`,
    };
  }
}
