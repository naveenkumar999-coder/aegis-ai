param(
    [int]$TimeoutSec = 6
)

Add-Type -AssemblyName System.Speech -ErrorAction SilentlyContinue

function Normalize-PhoneticText([string]$text) {
    if (-not $text) { return "" }
    $t = $text -replace '[.,!?;:]', ' '
    $t = $t.Trim()
    
    # If the recognized utterance begins with a greeting, lock it to clean greeting
    if ($t -match '(?i)^\s*(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow|hello)\b') {
        if ($t -match '(?i)^\s*(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow|hello)\s+(monday|boss|nani)\s*$') {
            return "hello monday"
        }
        if ($t -notmatch '(?i)\b(open|search|find|type|send|write|what|who|how|turn|launch|close)\b') {
            return "hello"
        }
    }
    
    # Common speech mishearings for greetings
    $t = $t -replace '(?i)\b(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow)\b', 'hello'
    $t = $t -replace '(?i)^\s*(?:eye|high|bye)\b', 'hi'
    $t = $t -replace '(?i)^\s*hay\b', 'hey'

    # WhatsApp phonetic variations
    $t = $t -replace '(?i)\bwhat\s*sap\b', 'whatsapp'
    $t = $t -replace '(?i)\bwhat''s\s*up\b(?=\s+in|\s+and|\s+chat|\s+to|\s+message|\s+app)', 'whatsapp'
    $t = $t -replace '(?i)\bwatch\s*app\b', 'whatsapp'
    $t = $t -replace '(?i)\bwhats\s*app\b', 'whatsapp'
    $t = $t -replace '(?i)\bwhats\s*up\b(?=\s+in|\s+and|\s+chat|\s+to|\s+message|\s+app)', 'whatsapp'
    $t = $t -replace '(?i)\bwhatapp\b', 'whatsapp'
    $t = $t -replace '(?i)\bwat\s*app\b', 'whatsapp'
    
    # App names
    $t = $t -replace '(?i)\bu\s*tube\b', 'youtube'
    $t = $t -replace '(?i)\byou\s*tube\b', 'youtube'
    $t = $t -replace '(?i)\bnot\s*pad\b', 'notepad'
    $t = $t -replace '(?i)\bflash\s*light\b', 'flashlight'
    
    # Contact names in WhatsApp context
    if ($t -match '(?i)\b(?:in|on|find|open|message|to)\s+(?:the\s+)?whatsapp\b|\bwhatsapp\s+(?:and\s+)?(?:open|find)\b') {
        $t = $t -replace '(?i)\b(?:clean|cream|quean|green|screen|quinn|kween)\b', 'Queen'
    }
    
    # Actions
    $t = $t -replace '(?i)\bwright\b', 'write'
    $t = $t -replace '(?i)\bsand\b(?=\s+it|\s+message|\s+the|\s+to|$)', 'send'
    $t = $t -replace '(?i)\bsaint\b(?=\s+it|\s+message|\s+the|\s+to|$)', 'send'
    
    return $t
}

try {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $engine.SetInputToDefaultAudioDevice()
    
    # 1. Greetings & Conversational Vocabulary Grammar (Highest Weight: 1.0)
    $gbGreetings = New-Object System.Speech.Recognition.GrammarBuilder
    $greetingsChoices = New-Object System.Speech.Recognition.Choices
    $greetingsChoices.Add([string[]]@(
        "hello", "hello there", "hello monday", "hi", "hi monday", "hey", "hey monday",
        "greetings", "good morning", "good afternoon", "good evening",
        "how are you", "who are you", "what is your name", "who created you", "who built you",
        "wake up", "are you there", "can you hear me", "monday",
        "boss", "boss nani", "thank you", "thanks", "what can you do", "help me", "tell me about yourself"
    ))
    $gbGreetings.Append($greetingsChoices)
    $grammarGreetings = New-Object System.Speech.Recognition.Grammar($gbGreetings)
    $grammarGreetings.Name = "Greetings"
    $grammarGreetings.Weight = 1.0
    $engine.LoadGrammar($grammarGreetings)

    # 2. WhatsApp Direct Action Grammar (Highest Weight: 1.0)
    $gbWA = New-Object System.Speech.Recognition.GrammarBuilder
    $gbWA.Append("open")
    $contacts = New-Object System.Speech.Recognition.Choices
    $contacts.Add([string[]]@("queen", "nani", "boss", "chat", "message"))
    $gbWA.Append($contacts)
    $gbWA.Append("in")
    $optThe = New-Object System.Speech.Recognition.Choices
    $optThe.Add([string[]]@("the", "my"))
    $gbWA.Append($optThe, 0, 1)
    $gbWA.Append("whatsapp")

    $actionsMsg = New-Object System.Speech.Recognition.Choices
    $actionsMsg.Add([string[]]@("and type", "and send", "type", "send"))
    $gbWA.Append($actionsMsg, 0, 1)
    $commonMsgs = New-Object System.Speech.Recognition.Choices
    $commonMsgs.Add([string[]]@("hello", "hi", "hey", "good morning", "how are you", "call me", "test"))
    $gbWA.Append($commonMsgs, 0, 1)

    $grammarWA = New-Object System.Speech.Recognition.Grammar($gbWA)
    $grammarWA.Name = "WhatsAppAction"
    $grammarWA.Weight = 1.0
    $engine.LoadGrammar($grammarWA)

    # 3. Grammar Builder for Assistant Commands (Highest Weight: 1.0)
    $gb = New-Object System.Speech.Recognition.GrammarBuilder
    $actions = New-Object System.Speech.Recognition.Choices
    $actions.Add([string[]]@("open", "find", "search", "write", "type", "send", "launch", "start", "read", "tell", "turn on", "turn off", "close", "show", "what is", "who is", "watch"))
    $targets = New-Object System.Speech.Recognition.Choices
    $targets.Add([string[]]@("whatsapp", "queen", "youtube", "google", "chrome", "edge", "notepad", "calculator", "flashlight", "camera", "screen", "browser", "page", "results", "monday", "nani", "boss", "properties", "specs", "webs", "windows", "apps", "status"))
    
    $gb.Append($actions)
    $gb.Append($targets, 1, 4)
    $cmdGrammar = New-Object System.Speech.Recognition.Grammar($gb)
    $cmdGrammar.Name = "AssistantCommands"
    $cmdGrammar.Weight = 1.0
    $engine.LoadGrammar($cmdGrammar)
    
    # 4. General Windows Dictation Grammar (Active: 0.60) - allows natural queries and full vocabulary
    $dictGrammar = New-Object System.Speech.Recognition.DictationGrammar
    $dictGrammar.Name = "Dictation"
    $dictGrammar.Weight = 0.60
    $engine.LoadGrammar($dictGrammar)
    
    # 5. Snappy End-of-Speech Silence Detection:
    # Finalizes within 650ms after user finishes speaking rather than hanging for seconds
    $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(650)
    $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(800)
    $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds($TimeoutSec)
    
    $res = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSec))
    if ($res -and $res.Text) {
        $bestText = $res.Text
        $maxScore = $res.Confidence
        
        # Check alternates to see if another candidate matches command keywords better
        if ($res.Alternates -and $res.Alternates.Count -gt 0) {
            foreach ($alt in $res.Alternates) {
                $altText = $alt.Text
                $score = $alt.Confidence
                if ($altText -match '(?i)\b(hello|hi|hey|whatsapp|queen|open|find|type|send|write|search|youtube|google|flashlight|monday|boss)\b') {
                    $score += 0.50
                }
                if ($score -gt $maxScore) {
                    $maxScore = $score
                    $bestText = $altText
                }
            }
        }
        
        $cleaned = Normalize-PhoneticText $bestText
        Write-Output (@{ success = $true; text = $cleaned; confidence = $res.Confidence } | ConvertTo-Json -Compress)
    } else {
        Write-Output (@{ success = $false; text = ""; message = "No speech detected within timeout" } | ConvertTo-Json -Compress)
    }
    $engine.Dispose()
} catch {
    Write-Output (@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
}
