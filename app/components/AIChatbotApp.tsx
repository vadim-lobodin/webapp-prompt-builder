'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "./ui/use-toast";
import OpenAI from 'openai';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import LoadingBar from 'react-top-loading-bar';

const openai = new OpenAI({
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
});

interface Message {
        content: string;
        isUser: boolean;
        id: number;
        opacity: number;
}

interface Choice {
        label: string;
        isSelected: boolean;
}

interface AIResponse {
        question?: string;
        options: string[];
}

interface KeyFeature {
  feature: string;
  description: string;
}

interface AppConcept {
  name: string;
  description: string;
  keyFeatures: KeyFeature[];
}

const ToggleButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void; className?: string }> = 
  ({ label, isSelected, onClick, className }) => (
    <Button
      onClick={onClick}
      className={`${className} ${
        isSelected ? 'bg-primary text-white border-primary' : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-100'
      }`}
    >
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-2 ${
        isSelected ? 'border-white' : 'border-gray-400'
      }`}>
        {isSelected && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span>{label}</span>
    </Button>
  );

const TypingEffect: React.FC<{ text: string; onComplete: () => void }> = ({ text, onComplete }) => {
        const [displayText, setDisplayText] = useState('');
        const [currentIndex, setCurrentIndex] = useState(0);

        useEffect(() => {
                if (currentIndex < text.length) {
                        const timer = setTimeout(() => {
                                setDisplayText(prev => prev + text[currentIndex]);
                                setCurrentIndex(prev => prev + 1);
                        }, 20);
                        return () => clearTimeout(timer);
                } else {
                        onComplete();
                }
        }, [text, currentIndex, onComplete]);

        return (
            <span>
            {displayText}
                    {currentIndex < text.length && <span className="animate-pulse">|</span>}
        </span>
        );
};

const CustomInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <Input
    {...props}
    ref={ref}
    className={`
      flex-grow h-[60px] text-[19px] font-normal rounded-full px-6
      border-none !border-0 outline-none !outline-0
      focus:ring-0 focus:ring-offset-0 focus:outline-none !focus:border-0
      placeholder-[#8E8E93]
      ${props.className}
    `}
    style={{
      boxShadow: 'none',
      margin: '0',
      ...props.style,
    }}
  />
));

CustomInput.displayName = 'CustomInput';

const MAX_QUESTIONS = 5;

const fadeAnimation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3 }
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 18) {
    return "Good afternoon";
  } else {
    return "Good evening";
  }
};

const AIChatbotApp: React.FC = () => {
        const [messages, setMessages] = useState<Message[]>([]);
        const [input, setInput] = useState('');
        const [choices, setChoices] = useState<Choice[]>([]);
        const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
        const [stage, setStage] = useState('initial');
        const [isLoading, setIsLoading] = useState(false);
        const [showChoices, setShowChoices] = useState(false);
        const [currentQuestion, setCurrentQuestion] = useState<string>('');
        const [isTypingComplete, setIsTypingComplete] = useState(true);
        const [promptError, setPromptError] = useState<string | null>(null);
        const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false);
        const [showCombinedPrompt, setShowCombinedPrompt] = useState(false);
        const [questionCount, setQuestionCount] = useState(0);
        const [appConcepts, setAppConcepts] = useState<AppConcept[]>([]);
        const { toast } = useToast();
        const [progress, setProgress] = useState(0);
        const loadingBarRef = useRef<any>(null);
        const [greeting, setGreeting] = useState(getGreeting());

        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
                if (inputRef.current) {
                        inputRef.current.focus();
                }
        }, []);

        const [inputPlaceholder, setInputPlaceholder] = useState("What kind of app would you like to create?");

        useEffect(() => {
          if (stage !== 'initial') {
            setInputPlaceholder("Select from options or type your option here");
          }
        }, [stage]);

        const handleInputSubmit = () => {
          if (stage === 'initial') {
            handleSendMessage();
          } else {
            handleNextStep();
          }
        };

        const addMessage = useCallback((content: string, isUser: boolean) => {
                setMessages(prev => [
                        ...prev.map(msg => ({ ...msg, opacity: msg.opacity * 0.5 })),
                        { content, isUser, id: Date.now(), opacity: 1 }
                ]);
                if (!isUser) {
                        setIsTypingComplete(false);
                        setShowChoices(false);
                }
        }, []);

        const handleTypingComplete = useCallback(() => {
                setIsTypingComplete(true);
                setShowChoices(true);
        }, []);

        const handleApiCall = useCallback(async (messages: OpenAI.Chat.ChatCompletionMessageParam[], expectQuestion: boolean = true): Promise<AIResponse> => {
                try {
                        console.log('Sending API request with messages:', messages);

                        const systemPrompt = `
You are an AI assistant designed to help users brainstorm app ideas efficiently. Your goal is to ask the minimum number of highly targeted questions to understand the user's needs, then generate three distinct and relevant app concepts.

Core Questions:
1. What specific problem or need should your app address?
2. Who is the primary target audience for your app?
3. What is the most important feature or functionality your app must have?

Adaptive Follow-up Questions:
- If the problem is unclear: "Can you provide an example scenario where this problem occurs?"
- If the target audience is vague: "What characteristics define your target users (e.g., age, interests, behaviors)?"
- If the core functionality is ambiguous: "How would you envision users interacting with this main feature?"

Interaction Flow:
1. Ask the first core question.
2. Based on the response, either move to the next core question or ask a relevant follow-up for clarification.
3. After gathering responses to all core questions, assess if you have sufficient information to generate ideas.
4. If not, ask the most relevant follow-up question to fill in critical gaps.
5. Limit total questions (including follow-ups) to a maximum of 5.

Current question count: ${questionCount}

IMPORTANT: Always respond with a JSON object containing 'question' and 'options' fields. The 'options' field must contain exactly 5 possible answers to the question. Format your response as follows:
{
  "question": "Your question here",
  "options": [
    "Option 1",
    "Option 2",
    "Option 3",
    "Option 4",
    "Option 5"
  ]
}
`;

                        const response = await openai.chat.completions.create({
                                model: "gpt-4o",
                                messages: [
                                        { role: "system", content: systemPrompt },
                                        ...messages,
                                        { role: "user", content: "Provide the next question and options based on our conversation so far." }
                                ],
                        });

                        console.log('Received raw API response:', response);

                        const content = response.choices[0].message.content;
                        if (!content) {
                                throw new Error("No content in AI response");
                        }

                        console.log('Raw content from AI:', content);

                        let parsedResponse: AIResponse;
                        try {
                                parsedResponse = JSON.parse(content) as AIResponse;
                        } catch (parseError) {
                                console.error('Failed to parse AI response as JSON:', parseError);
                                throw new Error("Invalid JSON format in AI response");
                        }

                        if (!parsedResponse.question || !Array.isArray(parsedResponse.options) || parsedResponse.options.length !== 5) {
                                throw new Error("Invalid response structure from AI");
                        }

                        console.log('Parsed response:', parsedResponse);
                        return parsedResponse;

                } catch (error) {
                        console.error('Detailed error in API call:', error);
                        if (error instanceof Error) {
                                throw new Error(`Failed to process AI response: ${error.message}`);
                        } else {
                                throw new Error("Failed to process AI response: Unknown error");
                        }
                }
        }, [questionCount]);

        const handleSendMessage = useCallback(async () => {
          if (input.trim() === '') {
            setPromptError("Your prompt is too abstract. Please be more specific.");
            return;
          }
          setPromptError(null);
          setIsLoading(true);
          // No initial progress set here

          try {
            const validationResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: "You are an AI assistant validating app idea prompts. Respond with 'VALID' for good prompts, 'ABSTRACT' for too abstract prompts, or 'INVALID' for prompts you can't process." },
                { role: "user", content: input }
              ],
            });

            const validationResult = validationResponse.choices[0].message.content?.trim().toUpperCase();

            if (validationResult === 'VALID') {
              addMessage(input, true);
              setInput('');
              setStage('in_progress');

              const aiResponse = await handleApiCall([
                { role: "user", content: input }
              ]);

              addMessage(aiResponse.question || "What would you like to know about the app?", false);
              setCurrentQuestion(aiResponse.question || "What would you like to know about the app?");
              setChoices(aiResponse.options.map((option) => ({
                label: option,
                isSelected: false
              })));
              setQuestionCount(1);
              setProgress(20); // Set to 20% after the first question
            } else if (validationResult === 'ABSTRACT') {
              setPromptError("Your prompt is too abstract. Please be more specific.");
            } else {
              setPromptError("I couldn't understand your prompt. Please try again.");
            }
          } catch (error) {
            console.error('Error in handleSendMessage:', error);
            addMessage("I'm sorry, I encountered an error processing the response. Please try again.", false);
          } finally {
            setIsLoading(false);
          }
        }, [input, addMessage, handleApiCall, setCurrentQuestion, setChoices]);

        const handleChoiceToggle = useCallback((label: string) => {
                setSelectedChoices(prev =>
                    prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]
                );
                setChoices(prev => prev.map(choice =>
                    choice.label === label ? {...choice, isSelected: !choice.isSelected} : choice
                ));
        }, []);

        const handleNextStep = useCallback(async () => {
          if (selectedChoices.length === 0) return;

          addMessage(`You: ${selectedChoices.join(', ')}`, true);
          setSelectedChoices([]);
          setShowChoices(false);

          if (questionCount < MAX_QUESTIONS - 1) {
            setIsLoading(true);
            setProgress(prev => Math.min(prev + 20, 80)); // Increment by 20% for each question, up to 80%
            try {
              const aiResponse = await handleApiCall([
                ...messages.map(msg => ({
                  role: msg.isUser ? "user" : "assistant",
                  content: msg.content
                })) as OpenAI.Chat.ChatCompletionMessageParam[],
                { role: "user", content: selectedChoices.join(', ') }
              ]);

              addMessage(aiResponse.question || "What else would you like to know about the app?", false);
              setCurrentQuestion(aiResponse.question || "What else would you like to know about the app?");
              setChoices(aiResponse.options.map((option) => ({
                label: option,
                isSelected: false
              })));
              setQuestionCount(prev => prev + 1);
            } catch (error) {
              console.error('Error in handleNextStep:', error);
              addMessage("I'm sorry, I encountered an error generating the next question. Please try again.", false);
            } finally {
              setIsLoading(false);
            }
          } else {
            setStage('completed');
            setIsGeneratingConcepts(true);
            setShowChoices(false);
            setMessages([]);
            setProgress(90); // Set to 90% when starting to generate concepts

            try {
              const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                  {
                    role: "system",
                    content: `Based on the user's responses, generate three concise and distinct app concepts. Each concept should include:
1. A short, catchy name for the app (max 5 words)
2. A brief description (1-2 sentences)
3. 3 key features, each described in 10 words or less

Format your response as a JSON object with an 'appConcepts' array containing three concept objects. Each object should have 'name', 'description', and 'keyFeatures' fields. The 'keyFeatures' field should be an array of objects, each with 'feature' and 'description' properties. Do not include any markdown formatting or code block syntax in your response.`
                  },
                  ...messages.map(msg => ({
                    role: msg.isUser ? "user" : "assistant",
                    content: msg.content
                  })) as OpenAI.Chat.ChatCompletionMessageParam[],
                  { role: "user", content: "Generate three concise app concepts based on our conversation." }
                ],
              });

              const appConceptsContent = response.choices[0].message.content;
              if (appConceptsContent) {
                try {
                  const cleanedContent = appConceptsContent.replace(/```json\s?|```/g, '').trim();
                  const parsedConcepts = JSON.parse(cleanedContent);
                  setAppConcepts(parsedConcepts.appConcepts);
                  setProgress(100); // Set to 100% when concepts are ready
                } catch (parseError) {
                  console.error('Failed to parse app concepts:', parseError);
                  console.log('Raw content:', appConceptsContent);
                  throw new Error("Invalid JSON format in app concepts response");
                }
              } else {
                throw new Error("No content in AI response for app concepts");
              }
            } catch (error) {
              console.error('Error generating app concepts:', error);
              toast({
                title: "Error",
                description: "Failed to generate app concepts. Please try again.",
                variant: "destructive",
              });
            } finally {
              setIsGeneratingConcepts(false);
              setShowCombinedPrompt(true);
            }
          }
        }, [selectedChoices, messages, addMessage, handleApiCall, setCurrentQuestion, setChoices, questionCount, toast]);

        const handleMoreChoices = useCallback(async () => {
          setIsLoading(true);
          try {
            console.log('Sending request for more choices...');
            console.log('Current question:', currentQuestion);
            console.log('Existing choices:', choices.map(c => c.label));

            const aiResponse = await handleApiCall([
              {
                role: "system",
                content: "You are an AI assistant helping to create an app concept. Based on the given question and existing choices, provide 5 additional, diverse, and relevant options. These should be different from the existing choices but still closely related to the question. Format your response as JSON with an 'options' field containing an array of 5 strings."
              },
              { role: "user", content: `Current question: "${currentQuestion}"\n\nExisting choices: ${choices.map(c => c.label).join(', ')}\n\nGenerate 5 more relevant and diverse options related to this question, different from the existing choices.` }
            ], false);

            console.log('Received AI response:', aiResponse);

            if (!aiResponse || !Array.isArray(aiResponse.options) || aiResponse.options.length === 0) {
              console.error('Invalid AI response structure:', aiResponse);
              throw new Error('Invalid response structure from AI');
            }

            setChoices(prev => [
              ...prev,
              ...aiResponse.options.map((option) => ({
                label: option,
                isSelected: false
              }))
            ]);

            console.log('New choices added successfully');
          } catch (error) {
            console.error('Detailed error in handleMoreChoices:', error);
            if (error instanceof Error) {
              addMessage(`I'm sorry, I encountered an error while fetching more options: ${error.message}. Please try again.`, false);
            } else {
              addMessage("I'm sorry, I encountered an unexpected error while fetching more options. Please try again.", false);
            }
          } finally {
            setIsLoading(false);
          }
        }, [currentQuestion, choices, handleApiCall, addMessage]);

        const copyToClipboard = useCallback(() => {
                const formattedConcepts = appConcepts.map(concept => `
${concept.description}

Features:
${concept.keyFeatures && concept.keyFeatures.length > 0
  ? concept.keyFeatures.map(feature => `- ${feature.feature}: ${feature.description}`).join('\n')
  : 'No key features specified.'}
  `).join('\n\n---\n\n');

                navigator.clipboard.writeText(formattedConcepts).then(() => {
                        toast({
                                title: "Copied!",
                                description: "App concepts copied to clipboard",
                        });
                }, (err) => {
                        console.error('Could not copy text: ', err);
                        toast({
                                title: "Error",
                                description: "Failed to copy app concepts",
                                variant: "destructive",
                        });
                });
        }, [appConcepts, toast]);

        const resetApp = useCallback(() => {
          setStage('initial');
          setMessages([]);
          setInput('');
          setChoices([]);
          setSelectedChoices([]);
          setQuestionCount(0);
          setAppConcepts([]);
          setProgress(0);
        }, []);

        useEffect(() => {
                window.scrollTo(0, document.body.scrollHeight);
        }, [messages, showChoices, promptError]);

        useEffect(() => {
          // Update greeting every minute
          const intervalId = setInterval(() => {
            setGreeting(getGreeting());
          }, 60000);

          return () => clearInterval(intervalId);
        }, []);

        const InputComponent = (
          <div className="flex items-center gap-3">
            <CustomInput
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleInputSubmit()}
              placeholder={inputPlaceholder}
              className="mt-2 bg-white"
            />
            <Button
              onClick={handleInputSubmit}
              className="rounded-full w-[60px] h-[60px] p-0 flex items-center justify-center bg-primary hover:bg-primary/90 flex-shrink-0"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-6 h-6 border-t-2 border-background rounded-full animate-spin"></div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6 text-primary-foreground">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </Button>
          </div>
        );

        return (
          <div className="flex flex-col items-center justify-center min-h-screen w-full text-foreground p-4 bg-gray-100 font-['SF Pro Display', 'Helvetica', 'Arial', sans-serif] antialiased">
            <LoadingBar color="#8B5CF6" progress={progress} onLoaderFinished={() => setProgress(0)} />
            <div className="w-full max-w-[800px] space-y-4 relative pb-20">
              <AnimatePresence mode="wait">
                {stage === 'initial' ? (
                  <motion.div key="initial-screen" {...fadeAnimation}>
                    <motion.h1 
                      className="text-[40px] font-normal text-foreground leading-tight text-center mb-8"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    >
                      {greeting}, Vadim.
                    </motion.h1>
                    <motion.div 
                      className="bg-white rounded-[20px] shadow-lg p-3"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    >
                      {InputComponent}
                    </motion.div>
                    {promptError && (
                      <motion.p 
                        className="text-gray-500 mt-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {promptError}
                      </motion.p>
                    )}
                  </motion.div>
                ) : isGeneratingConcepts ? (
                  <motion.div
                    key="generating-concepts"
                    {...fadeAnimation}
                    className="flex flex-col items-center justify-center h-[60vh]"
                  >
                    <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                    <p className="text-lg text-muted-foreground">Generating app concepts...</p>
                  </motion.div>
                ) : showCombinedPrompt ? (
                  <motion.div
                    key="app-concepts"
                    {...fadeAnimation}
                    className="space-y-6 w-full max-w-[600px] mx-auto"
                  >
                    <div className="flex flex-col space-y-6">
                      {appConcepts.map((concept, index) => (
                        <Card key={index} className="bg-white shadow-lg rounded-[20px] overflow-hidden w-full">
                          <CardContent className="p-6">
                            <p className="text-[16px] leading-[24px] text-foreground mb-6">{concept.description}</p>
                            {concept.keyFeatures && concept.keyFeatures.length > 0 ? (
                              <ul className="space-y-3">
                                {concept.keyFeatures.map((feature, featureIndex) => (
                                  <li key={featureIndex} className="text-[16px] leading-[24px] text-muted-foreground">
                                    <strong className="text-foreground">{feature.feature}:</strong> {feature.description}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[16px] leading-[24px] text-muted-foreground">No key features specified.</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="chat-interface" {...fadeAnimation}>
                    <div className="space-y-6">
                      {messages.map((message) => (
                        <motion.div key={message.id} {...fadeAnimation}>
                          <p className={`text-[19px] leading-[26px] text-left ${
                            message.isUser ? 'text-muted-foreground font-normal' : 'text-foreground font-semibold'
                          }`} style={{ opacity: message.opacity }}>
                            {message.isUser ? message.content : (
                              <TypingEffect text={message.content} onComplete={handleTypingComplete} />
                            )}
                          </p>
                        </motion.div>
                      ))}
                    </div>

                    {showChoices && isTypingComplete && (
                      <motion.div {...fadeAnimation} className="flex flex-wrap gap-3 mt-6 mb-20">
                        {choices.map((choice, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <ToggleButton
                              label={choice.label}
                              isSelected={choice.isSelected}
                              onClick={() => handleChoiceToggle(choice.label)}
                              className="h-14 px-5 py-3 rounded-full border text-[19px] font-normal"
                            />
                          </motion.div>
                        ))}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: choices.length * 0.05 }}
                        >
                          <Button
                            onClick={handleMoreChoices}
                            className="h-14 px-5 py-3 rounded-full text-[19px] font-normal bg-gray-100 text-gray-700 hover:bg-gray-200"
                            disabled={isLoading}
                          >
                            More
                          </Button>
                        </motion.div>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {stage !== 'initial' && !isGeneratingConcepts && !showCombinedPrompt && (
                <motion.div 
                  className="fixed bottom-4 left-4 right-4 max-w-[800px] mx-auto bg-white rounded-[20px] shadow-lg p-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {InputComponent}
                </motion.div>
              )}
            </div>
          </div>
        );
};

export default AIChatbotApp;