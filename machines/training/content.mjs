export default {
 slug:'training', title:'Inside training a neural net', hook:'Turn error into better weights.', level:'core', minutes:12, order:5, track:'learning',
 bigIdea:'Backprop finds how each weight affects error, and gradient descent nudges weights downhill.',
 machine:'A forward pulse moves through weighted dials and gearboxes to a gauge, and a return belt turns the dials against their gradients.',
 stations:[
  {id:'input',concept:'INPUT',does:'Feeds the four XOR points into two levers.',fails:'The network has no examples to learn from.'},
  {id:'hidden',concept:'HIDDEN',does:'Weights inputs and applies the chosen activation.',fails:'Without a nonlinearity the network remains a linear function.'},
  {id:'loss',concept:'LOSS',does:'Measures mean squared error across all four points.',fails:'There is no error to guide an update.'},
  {id:'backprop',concept:'GRADIENT',does:'Sends each weight its gradient and turns it against that slope.',fails:'The weights stay at their initial values.'}
 ],
 quiz:[
 {stage:'pre',question:'Can a network with only linear layers solve XOR?',options:['Yes, with enough layers','No, the combined function is linear','Yes, with any learning rate','No, because XOR has only four points'],correct:1,explanation:'With activation set to none, the loss settles near 0.25 on the four XOR points.'},
 {stage:'check',question:'What does the loss gauge measure?',options:['Mean squared prediction error','Number of hidden units','Size of the input values','Time taken to train'],correct:0,explanation:'The loss readout averages the squared errors across all four points.'},
 {stage:'check',question:'What travels back to the weight dials?',options:['The four input labels','The final predicted class','Each weight’s loss gradient','The number of hidden units'],correct:2,explanation:'The return belt carries gradients, which measure how loss changes with each weight.'},
 {stage:'check',question:'How does a weight update use its gradient?',options:['It adds the loss to the weight','It multiplies the weight by the loss','It adds the gradient to the input','It subtracts the scaled gradient'],correct:3,explanation:'The dials turn against the gradient, scaled by the learning rate.'},
 {stage:'post',question:'What can a rate that is too high do?',options:['Guarantee the best solution','Make loss rise or diverge','Remove the need for gradients','Make every layer linear'],correct:1,explanation:'With a large rate the chart can climb as the updates overshoot.'},
 {stage:'post',question:'Why can tanh help solve XOR?',options:['It adds a nonlinear bend','It removes all the weights','It changes the four labels','It makes the loss constant'],correct:0,explanation:'The hidden gearboxes apply tanh, letting their combination bend the decision boundary.'}
 ],
 sources:[{label:'Rumelhart, Hinton and Williams: Learning representations by back-propagating errors',url:'https://doi.org/10.1038/323533a0'},{label:'Deep Learning, chapter 6',url:'https://www.deeplearningbook.org/contents/mlp.html'}],
 notes:'This small network uses seeded initial weights, a linear output and full-batch mean squared error on four XOR points. The six dial assemblies are a simplified view of the weights.'
};
